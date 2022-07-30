import {
  getTransactions,
  getAccountTransactions,
  getTowerState,
  getEvents,
  getAccount,
} from './api/node'
import { TransactionsResponse } from './types/0l'
import { AxiosResponse } from 'axios'
import { get } from 'lodash'
import {
  PermissionNodeMinerModel,
  PermissionNodeValidatorModel,
  EpochSchemaModel,
  MinerEpochStatsSchemaModel,
  AccountBalanceModel,
  AccountLastProcessedModel,
} from './db'
import communityWallets from './communityWallets'
import { connection } from 'mongoose'

const TRANSACTIONS_PER_FETCH = 1000

const scrapeRecursive = async (accounts, generation, getEpochForVersion) => {
  const nextAccounts = []
  for (const act of accounts) {
    const account = act.toLowerCase()
    let transactions: AxiosResponse<TransactionsResponse>
    let start = 0

    const accountLastProcessed = await AccountLastProcessedModel.findOne({
      address: account,
    })
    if (accountLastProcessed) {
      start = accountLastProcessed.offset
    }

    const proofsPerEpoch = {}

    do {
      console.log('Getting batch of transactions', { account, start })
      transactions = await getAccountTransactions({
        account,
        start,
        limit: TRANSACTIONS_PER_FETCH,
        includeEvents: true,
      })

      if (!transactions.data || !transactions.data.result) break

      for (const transaction of transactions.data.result) {
        const functionName = get(
          transaction,
          'transaction.script.function_name'
        )

        if (transaction.vm_status.type !== 'executed') continue

        if (
          functionName === 'minerstate_commit' ||
          functionName === 'minerstate_commit_by_operator'
        ) {
          const epoch = getEpochForVersion(transaction.version)
          if (!proofsPerEpoch[epoch]) {
            proofsPerEpoch[epoch] = 0
            const existingStat = await MinerEpochStatsSchemaModel.findOne({
              epoch,
              address: account,
            })
            if (existingStat) {
              proofsPerEpoch[epoch] = existingStat.count
            }
          }
          proofsPerEpoch[epoch]++
        }

        const indexOfFunction = [
          'create_acc_val',
          'create_user_by_coin_tx',
        ].indexOf(functionName)

        if (indexOfFunction !== -1) {
          const isValidatorOnboard = indexOfFunction === 0
          const firstScriptArgument = get(
            transaction,
            'transaction.script.arguments_bcs[0]'
          )
          const onboardedAccount = isValidatorOnboard
            ? firstScriptArgument.substring(36, 68)
            : firstScriptArgument
          const version_onboarded = transaction.version
          const epoch_onboarded = getEpochForVersion(version_onboarded)
          const towerStateRes = await getTowerState({
            account: onboardedAccount,
          })
          const balanceRes = await getAccount({ account: onboardedAccount })
          const balance = balanceRes.data.result.balances.find(
            (balance) => balance.currency.toLowerCase() === 'gas'
          ).amount

          if (nextAccounts.indexOf(onboardedAccount) === -1)
            nextAccounts.push(onboardedAccount)
          if (isValidatorOnboard) {
            // validator onboard
            let operator_address

            if (transaction.events && transaction.events.length > 0) {
              const operatorCreateEvent = transaction.events.find(
                (event) =>
                  get(event, 'data.type') === 'receivedpayment' &&
                  get(event, 'data.receiver') !== onboardedAccount
              )
              if (operatorCreateEvent) {
                operator_address = get(operatorCreateEvent, 'data.receiver')
                if (operator_address) nextAccounts.push(operator_address)
              }
            }

            await PermissionNodeValidatorModel.findOneAndUpdate(
              { address: onboardedAccount },
              {
                address: onboardedAccount,
                operator_address,
                parent: account,
                version_onboarded,
                epoch_onboarded,
                generation,
              },
              { upsert: true }
            )
            console.log('Found onboarded validator', {
              account,
              onboardedAccount,
              balance,
            })
          }

          const towerHeight = get(
            towerStateRes,
            'data.result.verified_tower_height'
          )
          const proofsInEpoch = get(
            towerStateRes,
            'data.result.actual_count_proofs_in_epoch'
          )

          await AccountBalanceModel.findOneAndUpdate(
            { address: onboardedAccount },
            {
              address: onboardedAccount,
              balance,
              accountType: communityWallets[onboardedAccount.toLowerCase()]
                ? 'community'
                : isValidatorOnboard
                ? 'validator'
                : towerHeight > 0
                ? 'miner'
                : 'basic',
            },
            { upsert: true }
          )

          await PermissionNodeMinerModel.findOneAndUpdate(
            { address: onboardedAccount },
            {
              address: onboardedAccount,
              parent: account,
              version_onboarded,
              epoch_onboarded,
              has_tower: Boolean(towerHeight),
              is_active: Boolean(proofsInEpoch),
              generation,
            },
            { upsert: true }
          )
          console.log('Found onboarded miner', {
            account,
            onboardedAccount,
            version_onboarded,
            epoch_onboarded,
            towerHeight,
            proofsInEpoch,
            balance,
          })
        }
      }

      start += TRANSACTIONS_PER_FETCH
    } while (transactions.data.result.length === TRANSACTIONS_PER_FETCH)

    const newOffset = start + transactions.data.result.length - TRANSACTIONS_PER_FETCH
    await AccountLastProcessedModel.findOneAndUpdate(
      { address: account },
      {
        address: account,
        offset: newOffset,
      },
      { upsert: true }
    )

    const minedEpochs = Object.keys(proofsPerEpoch)
    for (const epochString of minedEpochs) {
      const epoch = parseInt(epochString)
      await MinerEpochStatsSchemaModel.findOneAndUpdate(
        { epoch, address: account },
        {
          epoch,
          address: account,
          count: proofsPerEpoch[epochString],
        },
        { upsert: true }
      )
    }
  }

  console.log('will scrape next set of accounts')
  if (nextAccounts.length > 0)
    await scrapeRecursive(nextAccounts, generation + 1, getEpochForVersion)
}

const scrape = async () => {
  const startTime = Date.now()

  console.log('Fetching genesis transactions')
  const genesisRes = await getTransactions({
    startVersion: 0,
    limit: 1,
    includeEvents: true,
  })

  const genesisAccounts = genesisRes.data.result[0].events.filter(
    (event) => event.data.type === 'receivedpayment'
  )

  const genesisValidators = genesisRes.data.result[0].events
    .filter(
      (event) => event.data.type === 'createaccount' && event.data.role_id === 3
    )
    .map((event) => event.data.created_address)

  for (const event of genesisAccounts) {
    const account = event.data.receiver
    const towerStateRes = await getTowerState({ account })
    const towerHeight = get(towerStateRes, 'data.result.verified_tower_height')
    const proofsInEpoch = get(
      towerStateRes,
      'data.result.actual_count_proofs_in_epoch'
    )

    const isValidator = genesisValidators.indexOf(account) >= 0

    const balanceRes = await getAccount({ account })
    const balance = balanceRes.data.result.balances.find(
      (balance) => balance.currency.toLowerCase() === 'gas'
    ).amount

    await AccountBalanceModel.findOneAndUpdate(
      { address: account },
      {
        address: account,
        balance,
        accountType: communityWallets[account.toLowerCase()]
          ? 'community'
          : isValidator
          ? 'validator'
          : towerHeight > 0
          ? 'miner'
          : 'basic',
      },
      { upsert: true }
    )

    await PermissionNodeMinerModel.findOneAndUpdate(
      { address: account },
      {
        address: account,
        parent: '00000000000000000000000000000000',
        epoch_onboarded: 0,
        version_onboarded: 0,
        has_tower: Boolean(towerHeight),
        is_active: Boolean(proofsInEpoch),
        generation: 0,
      },
      { upsert: true }
    )
    if (isValidator) {
      const operatorCreateEvent = genesisRes.data.result[0].events.find(
        (event) => get(event, 'data.sender') === account
      )
      let operator_address
      if (operatorCreateEvent)
        operator_address = get(operatorCreateEvent, 'data.receiver')
      await PermissionNodeValidatorModel.findOneAndUpdate(
        { address: account },
        {
          address: account,
          operator_address,
          parent: '00000000000000000000000000000000',
          epoch_onboarded: 0,
          version_onboarded: 0,
          generation: 0,
        },
        { upsert: true }
      )
    }
  }

  const epochVersion = {}
  let currentEpoch = -1

  let start = 0
  let epochEventsRes
  do {
    epochEventsRes = await getEvents({
      key: '040000000000000000000000000000000000000000000000',
      start,
      limit: 1000,
    })

    for (const event of epochEventsRes.data.result.sort((a, b) => {
      b.data.epoch - a.data.epoch
    })) {
      const epoch = event.data.epoch
      const start_version = event.transaction_version

      const transactionRes = await getTransactions({
        startVersion: start_version,
        limit: 1,
        includeEvents: false,
      })
      const expiration = get(
        transactionRes,
        'data.result[0].transaction.timestamp_usecs'
      )
      const timestamp = expiration ? expiration / 1000000 : undefined

      let miner_payment_total

      const epochRecord = await EpochSchemaModel.findOne({ epoch: epoch + 1 })
      if (epochRecord) {
        const transaction = await getTransactions({
          startVersion: epochRecord.height,
          limit: 1,
          includeEvents: true,
        })
        const validatorsRes = await PermissionNodeValidatorModel.find()
        const validatorsAddresses = [
          ...validatorsRes.map((validator) => validator.address),
          ...validatorsRes.map((validator) => validator.operator_address),
        ]

        for (const event of transaction.data.result[0].events) {
          if (validatorsAddresses.indexOf(get(event, 'data.receiver')) !== -1)
            continue
          if (
            event.data.sender === '00000000000000000000000000000000' &&
            event.data.type === 'receivedpayment'
          ) {
            const amount = get(event, 'data.amount.amount')
            if (amount) {
              if (miner_payment_total === undefined) miner_payment_total = 0
              miner_payment_total += amount
            }
          }
        }
      }

      currentEpoch = epoch

      await EpochSchemaModel.findOneAndUpdate(
        { epoch },
        {
          epoch,
          height: start_version,
          timestamp,
          ...(miner_payment_total !== undefined && {
            miner_payment_total: isNaN(miner_payment_total)
              ? 0
              : miner_payment_total,
          }),
        },
        { upsert: true }
      )

      epochVersion[epoch] = start_version

      console.log({ epoch, start_version, timestamp })
    }

    start += 1000
  } while (epochEventsRes.data.result.length === 1000)

  const getEpochForVersion = (version) => {
    for (let i = 0; i <= currentEpoch; i++) {
      if (version < epochVersion[i]) return i - 1
    }
    return currentEpoch
  }

  await scrapeRecursive(
    genesisAccounts.map((event) => event.data.receiver),
    1,
    getEpochForVersion
  )

  console.log('Done, time elapsed (s):', (Date.now() - startTime) / 1000)
  await connection.close()
  process.exit(0)
}

scrape()

export default scrape
