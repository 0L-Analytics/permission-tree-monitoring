import {
  getTransactions,
  getAccountTransactions,
  getTowerState,
  getEvents,
  getAccount,
} from './api/node'
import { TransactionsResponse } from './types/0l'
import { AxiosResponse } from 'axios'
import { get, groupBy, values } from 'lodash'
import {
  PermissionNodeMinerModel,
  PermissionNodeValidatorModel,
  EpochSchemaModel,
  MinerEpochStatsSchemaModel,
  AccountBalanceModel,
  AccountLastProcessedModel,
  GlobalLastProcessedModel,
} from './db'
import AsyncLock from 'async-lock'

import { connection } from 'mongoose'

const TRANSACTIONS_PER_FETCH = 1000

const ACCOUNTS_AT_A_TIME = 15

const scrapeAccount = async (
  act,
  generation,
  getEpochForVersion,
  addToNextAccounts
) => {
  const account = act.toLowerCase()

  const balanceRes = await retryUntilSuccess(
    `getting balances for account: ${account}`,
    getAccount({ account })
  )

  const balance = balanceRes.data.result.balances.find(
    (balance) => balance.currency.toLowerCase() === 'gas'
  ).amount

  await AccountBalanceModel.findOneAndUpdate(
    { address: account },
    {
      address: account,
      balance,
    },
    { upsert: true }
  )

  let transactions: AxiosResponse<TransactionsResponse>
  let start = 0
  let initialStart = 0
  let foundProofs = 0

  const accountLastProcessed = await AccountLastProcessedModel.findOne({
    address: account,
  })
  if (accountLastProcessed) {
    start = accountLastProcessed.offset
    initialStart = accountLastProcessed.offset
  }

  const proofsPerEpoch = {}
  const initialProofsPerEpoch = {}

  do {
    transactions = await retryUntilSuccess(
      `getting batch of transactions for account: ${account}, start: ${start}`,
      getAccountTransactions({
        account,
        start,
        limit: TRANSACTIONS_PER_FETCH,
        includeEvents: true,
      })
    )

    if (!transactions.data || !transactions.data.result) break

    for (const transaction of transactions.data.result) {
      const functionName = get(transaction, 'transaction.script.function_name')

      if (transaction.vm_status.type !== 'executed') continue

      if (
        functionName === 'minerstate_commit' ||
        functionName === 'minerstate_commit_by_operator'
      ) {
        const epoch = await getEpochForVersion(transaction.version)
        if (!proofsPerEpoch[epoch]) {
          initialProofsPerEpoch[epoch] = 0
          proofsPerEpoch[epoch] = 0
          const existingStat = await MinerEpochStatsSchemaModel.findOne({
            epoch,
            address: account,
          })
          if (existingStat) {
            proofsPerEpoch[epoch] = existingStat.count
            initialProofsPerEpoch[epoch] = existingStat.count
          } else {
            console.log(`No existing stat for account ${account} for epoch ${epoch}`)
          }
        }
        proofsPerEpoch[epoch]++
        foundProofs++
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
        const epoch_onboarded = await getEpochForVersion(version_onboarded)

        await addToNextAccounts(onboardedAccount)
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
              if (operator_address) await addToNextAccounts(operator_address)
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
            generation,
          })
        }

        await PermissionNodeMinerModel.findOneAndUpdate(
          { address: onboardedAccount },
          {
            address: onboardedAccount,
            parent: account,
            version_onboarded,
            epoch_onboarded,
            generation,
          },
          { upsert: true }
        )
        console.log('Found onboarded miner', {
          account,
          onboardedAccount,
          version_onboarded,
          epoch_onboarded,
          balance,
          generation,
        })
      }
    }

    start += transactions.data.result.length
  } while (transactions.data.result.length === TRANSACTIONS_PER_FETCH)

  const newTransactions = start - initialStart
  if (newTransactions > 0) console.log(`processed new transactions: ${newTransactions}, proofs: ${foundProofs} for account ${account}`)

  await AccountLastProcessedModel.findOneAndUpdate(
    { address: account },
    {
      address: account,
      offset: start,
    },
    { upsert: true }
  )

  for (const epochString in proofsPerEpoch) {
    const epoch = parseInt(epochString)
    const initialCount = initialProofsPerEpoch[epochString]
    const count = proofsPerEpoch[epochString]
    console.log(`updating proof count from ${initialCount} to ${count} for epoch ${epochString} for account ${account}`)
    await MinerEpochStatsSchemaModel.findOneAndUpdate(
      { epoch, address: account },
      {
        epoch,
        address: account,
        count,
      },
      { upsert: true }
    )
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const retryUntilSuccess = async (name, fn) => {
  let res
  let init = true
  do {
    if (!init && (!res || res.status !== 200)) {
      if (res) {
        console.error('Failed', name, res.statusText, res.data)
      } else {
        console.error('Failed', name)
      }
      await delay(1000)
    }
    init = false
    try {
      res = await fn
    } catch (err) {
      console.error('Error', name)
    }
  } while (!res || res.status !== 200)
  console.error('Success', name)
  return res
}

const scrapeRecursive = async (
  accounts,
  generation,
  getEpochForVersion,
  addToAccountsProcessed
) => {
  const nextAccounts = []
  var nextAccountsLock = new AsyncLock()

  const addToNextAccounts = async (account) => {
    await nextAccountsLock.acquire('', () => {
      if (nextAccounts.indexOf(account) === -1) {
        nextAccounts.push(account)
      }
    })
  }

  for (let i = 0; i < accounts.length; i += ACCOUNTS_AT_A_TIME) {
    const partition = accounts.slice(i, i + ACCOUNTS_AT_A_TIME)
    const promises = []
    for (const account of partition) {
      promises.push(
        scrapeAccount(
          account,
          generation,
          getEpochForVersion,
          addToNextAccounts
        )
      )
    }
    await Promise.all(promises)
    console.log('done scraping partition of accounts')
    addToAccountsProcessed(partition.length)
  }

  console.log('will scrape next set of accounts')

  const genMiners = await PermissionNodeMinerModel.find({
    generation: generation,
  })

  const genValidators = await PermissionNodeValidatorModel.find({
    generation: generation,
  })

  // include accounts that are already known
  for (const account of genMiners) {
    if (nextAccounts.indexOf(account.address) === -1) nextAccounts.push(account.address)
  }

  for (const account of genValidators) {
    // validators also have entry in PermissionNodeMiner collection, so only need to include operators
    if (nextAccounts.indexOf(account.operator_address) === -1) nextAccounts.push(account.operator_address)
  }

  if (nextAccounts.length > 0)
    await scrapeRecursive(
      nextAccounts,
      generation + 1,
      getEpochForVersion,
      addToAccountsProcessed
    )
}

const scrape = async () => {
  const startTime = Date.now()

  console.log('Fetching genesis transactions')
  const genesisRes = await retryUntilSuccess(
    'fetching genesis transactions',
    getTransactions({
      startVersion: 0,
      limit: 1,
      includeEvents: true,
    })
  )

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
    const isValidator = genesisValidators.indexOf(account) >= 0

    await PermissionNodeMinerModel.findOneAndUpdate(
      { address: account },
      {
        address: account,
        parent: '00000000000000000000000000000000',
        epoch_onboarded: 0,
        version_onboarded: 0,
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

  const epochs = await EpochSchemaModel.find()

  for (const epoch of epochs) {
    epochVersion[epoch.epoch] = epoch.height
    if (epoch.epoch > currentEpoch) currentEpoch = epoch.epoch
  }

  console.log('bootstrapped epochVersion', Object.keys(epochVersion).length)

  let initialScrapeComplete = false
  const initialScrapeCompleteRes = await GlobalLastProcessedModel.findOne({
    key: 'initial_scrape_complete',
  })
  if (initialScrapeCompleteRes) {
    initialScrapeComplete = true
  }

  let epochOffset = 0

  const epochLastProcessedRes = await GlobalLastProcessedModel.findOne({
    key: 'epoch',
  })
  if (epochLastProcessedRes) {
    epochOffset = epochLastProcessedRes.offset - 1
  }

  let epochEventsRes
  do {
    epochEventsRes = await retryUntilSuccess(
      'getting epoch events',
      getEvents({
        key: '040000000000000000000000000000000000000000000000',
        start: epochOffset,
        limit: TRANSACTIONS_PER_FETCH,
      })
    )

    for (const event of epochEventsRes.data.result.sort((a, b) => {
      b.data.epoch - a.data.epoch
    })) {
      const epoch = event.data.epoch
      const start_version = event.transaction_version

      const transactionRes = await retryUntilSuccess(
        'getting epoch transactions with events',
        getTransactions({
          startVersion: start_version,
          limit: 1,
          includeEvents: true,
        })
      )

      const events = get(transactionRes, 'data.result[0].events')

      let total_supply = 0
      const previousEpoch = await EpochSchemaModel.findOne({ epoch: epoch - 1 })
      if (previousEpoch) {
        total_supply = previousEpoch.total_supply
      }

      let minted = 0
      let burned = 0
      let miner_payment_total = 0

      const validatorsRes = await PermissionNodeValidatorModel.find()
      const validatorsAddresses = [
        ...validatorsRes.map((validator) => validator.address),
        ...validatorsRes.map((validator) => validator.operator_address),
      ]

      if (events) {
        console.log('processing epoch events', events.length)
        for (const event of events) {
          const { key } = event
          const currency = get(event, 'data.amount.currency')
          const amount = get(event, 'data.amount.amount')
          switch (key) {
            case '050000000000000000000000000000000000000000000000':
              // mint event
              if (currency === 'GAS' && amount) {
                total_supply += amount
                minted += amount
              }
              break
            case '060000000000000000000000000000000000000000000000':
              // burn event
              if (currency === 'GAS' && amount) {
                total_supply -= amount
                burned += amount
              }
              break
            default:
              break
          }

          if (validatorsAddresses.indexOf(get(event, 'data.receiver')) !== -1)
            continue
          if (
            event.data.sender === '00000000000000000000000000000000' &&
            event.data.type === 'receivedpayment'
          ) {
            if (amount) {
              miner_payment_total += amount
            }
          }
        }
      }

      const expiration = get(
        transactionRes,
        'data.result[0].transaction.timestamp_usecs'
      )
      const timestamp = expiration ? expiration / 1000000 : undefined

      currentEpoch = epoch

      await EpochSchemaModel.findOneAndUpdate(
        { epoch },
        {
          epoch,
          height: start_version,
          timestamp,
          total_supply,
          minted,
          burned,
          ...(miner_payment_total !== undefined && {
            miner_payment_total: isNaN(miner_payment_total)
              ? 0
              : miner_payment_total,
          }),
        },
        { upsert: true }
      )

      epochVersion[epoch] = start_version

      console.log({
        epoch,
        start_version,
        timestamp,
        total_supply,
        minted,
        burned,
        miner_payment_total,
      })
    }

    epochOffset += epochEventsRes.data.result.length
  } while (epochEventsRes.data.result.length === TRANSACTIONS_PER_FETCH)

  if (initialScrapeComplete) {
    await GlobalLastProcessedModel.findOneAndUpdate(
      { key: 'epoch' },
      { key: 'epoch', offset: epochOffset },
      { upsert: true }
    )
  }

  const updateLatestEpoch = async () => {
    console.log('updating latest epoch')
    let epochEventsRes
    let lastEpoch
    do {
      console.log('fetching epoch events', { start: epochOffset })
      epochEventsRes = await retryUntilSuccess(
        'fetching epoch events',
        getEvents({
          key: '040000000000000000000000000000000000000000000000',
          start: epochOffset,
          limit: TRANSACTIONS_PER_FETCH,
        })
      )
      if (epochEventsRes.data.result.length > 0) {
        for (const event of epochEventsRes.data.result) {
          epochVersion[event.data.epoch] = event.transaction_version
        }
        lastEpoch =
          epochEventsRes.data.result[epochEventsRes.data.result.length - 1].data
            .epoch
      }

      epochOffset += epochEventsRes.data.result.length
    } while (epochEventsRes.data.result.length === TRANSACTIONS_PER_FETCH)
    if (lastEpoch !== undefined) {
      currentEpoch = lastEpoch
    }
  }

  let lastEpochCheck = Date.now()

  const epochLock = new AsyncLock()

  const getEpochForVersion = async (version) => {
    for (let i = 2; i <= currentEpoch; i++) {
      if (epochVersion[i] && version < epochVersion[i]) {
        console.log('epochForVersion 1', i-1)
        return i - 1
      }
    }
    await epochLock.acquire('epoch', async () => {
      const newEpochCheck = Date.now()
      if (newEpochCheck - lastEpochCheck > 5000) {
        await updateLatestEpoch()
        lastEpochCheck = newEpochCheck
      }
    })
    // in or after current epoch
    console.log('epochForVersion 2', currentEpoch)
    return currentEpoch
  }

  let accountsProcessed = 0
  const addToAccountsProcessed = more => accountsProcessed += more

  await scrapeRecursive(
    genesisAccounts.map((event) => event.data.receiver),
    1,
    getEpochForVersion,
    addToAccountsProcessed
  )

  if (!initialScrapeComplete) {
    await GlobalLastProcessedModel.findOneAndUpdate(
      { key: 'initial_scrape_complete' },
      { key: 'initial_scrape_complete', offset: 1 },
      { upsert: true }
    )
  }

  console.log(
    'Done, time elapsed (s):',
    (Date.now() - startTime) / 1000,
    'accounts processed',
    accountsProcessed
  )
  await connection.close()
  process.exit(0)
}

scrape()

export default scrape
