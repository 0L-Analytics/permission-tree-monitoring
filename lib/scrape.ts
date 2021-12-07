import {
  getTransactions,
  getAccountTransactions,
  getTowerState,
  getEvents,
} from './api/node'
import { TransactionsResponse } from './types/0l'
import { AxiosResponse } from 'axios'
import { get } from 'lodash'
import { PermissionNodeMinerModel, PermissionNodeValidatorModel, EpochSchemaModel, MinerEpochStatsSchemaModel } from './db'
import { connection } from 'mongoose'

const TRANSACTIONS_PER_FETCH = 1000

const scrapeRecursive = async (accounts) => {
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

    for (const event of epochEventsRes.data.result) {
      const epoch = event.data.epoch
      const start_version = event.transaction_version

      const transactionRes = await getTransactions({startVersion: start_version, limit: 1, includeEvents: false})
      const expiration = get(transactionRes, 'data.result[0].transaction.timestamp_usecs')
      const timestamp = expiration ? (expiration / 1000000) : undefined

      currentEpoch = epoch

      await EpochSchemaModel.findOneAndUpdate(
        { epoch },
        {
          epoch,
          height: start_version,
          timestamp
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

  const nextAccounts = []
  for (const account of accounts) {
    let transactions: AxiosResponse<TransactionsResponse>
    let start = 0

    const proofsPerEpoch = {}

    do {
      console.log('Getting batch of transactions', { account, start })
      transactions = await getAccountTransactions({
        account,
        start,
        limit: TRANSACTIONS_PER_FETCH,
        includeEvents: false,
      })

      if (!transactions.data || !transactions.data.result) break

      for (const transaction of transactions.data.result) {
        const functionName = get(
          transaction,
          'transaction.script.function_name'
        )

        if (transaction.vm_status.type !== 'executed') continue

        if (functionName === 'minerstate_commit' || functionName === 'minerstate_commit_by_operator') {
          const epoch = getEpochForVersion(transaction.version)
          if (!proofsPerEpoch[epoch]) proofsPerEpoch[epoch] = 0
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

          if (nextAccounts.indexOf(onboardedAccount) === -1)
            nextAccounts.push(onboardedAccount)
          if (isValidatorOnboard) {
            // validator onboard
            await PermissionNodeValidatorModel.findOneAndUpdate(
              { address: onboardedAccount },
              {
                address: onboardedAccount,
                parent: account,
                version_onboarded,
                epoch_onboarded,
              },
              { upsert: true }
            )
            console.log('Found onboarded validator', {
              account,
              onboardedAccount,
            })
          }

          const towerHeight = get(
            towerStateRes,
            'data.result.verified_tower_height'
          )
          const proofsInEpoch = get(
            towerStateRes,
            'data.result.count_proofs_in_epoch'
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
            },
            { upsert: true }
          )
          console.log('Found onboarded miner', {
            account,
            onboardedAccount,
            currentEpoch,
            version_onboarded,
            epoch_onboarded,
            towerHeight,
            proofsInEpoch,
          })
        }
      }

      start += TRANSACTIONS_PER_FETCH
    } while (transactions.data.result.length === TRANSACTIONS_PER_FETCH)

    const minedEpochs = Object.keys(proofsPerEpoch)
    for (const epochString of minedEpochs) {
      const epoch = parseInt(epochString)
      await MinerEpochStatsSchemaModel.findOneAndUpdate(
        { epoch, address: account },
        {
          epoch, 
          address: account,
          count: proofsPerEpoch[epochString]
        },
        { upsert: true }
      )
    }
  }

  console.log('will scrape next set of accounts')
  if (nextAccounts.length > 0) await scrapeRecursive(nextAccounts)
}

const scrape = async () => {
  const startTime = Date.now()

  console.log('Fetching genesis transactions')
  const genesisRes = await getTransactions({
    startVersion: 0,
    limit: 1,
    includeEvents: true,
  })

  const genesisAccounts = genesisRes.data.result[0].events
    .filter((event) => event.data.type === 'receivedpayment')
    .map((event) => event.data.receiver)
  const genesisValidators = genesisRes.data.result[0].events
    .filter(
      (event) => event.data.type === 'createaccount' && event.data.role_id === 3
    )
    .map((event) => event.data.created_address)

  for (const account of genesisAccounts) {
    const towerStateRes = await getTowerState({ account })
    const towerHeight = get(towerStateRes, 'data.result.verified_tower_height')
    const proofsInEpoch = get(
      towerStateRes,
      'data.result.count_proofs_in_epoch'
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
      },
      { upsert: true }
    )
  }

  for (const account of genesisValidators) {
    await PermissionNodeValidatorModel.findOneAndUpdate(
      { address: account },
      {
        address: account,
        parent: '00000000000000000000000000000000',
        epoch_onboarded: 0,
        version_onboarded: 0,
      },
      { upsert: true }
    )
  }

  await scrapeRecursive(genesisAccounts)

  console.log('Done, time elapsed (s):', (Date.now() - startTime) / 1000)
  connection.close()
}

scrape()

export default scrape
