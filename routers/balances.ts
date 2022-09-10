import Router from '@koa/router'
import communityWallets from '../lib/communityWallets'
import {
  AccountBalanceModel, MinerEpochStatsSchemaModel, PermissionNodeValidatorModel
} from '../lib/db'


const router = new Router({ prefix: '/balances' })

const getAccountType = async (address) => {
  if (communityWallets[address]) return 'community'
  if (await PermissionNodeValidatorModel.findOne({address})) return 'validator'
  if (await MinerEpochStatsSchemaModel.findOne({ address })) return 'miner'
  return 'basic'
}

router.get('/', async (ctx) => {
  const { account_type } = ctx.request.query
  const balances = await AccountBalanceModel.find().sort([['balance', -1]])
  const enrichedWithAccountType = await Promise.all(balances.map(async b => ({address: b.address, balance: b.balance, account_type: await getAccountType(b.address) })))
  if (account_type) {
    ctx.body = enrichedWithAccountType.filter(balance => balance.account_type === account_type)
  } else {
    ctx.body = enrichedWithAccountType
  }
})

router.get('/:account', async (ctx) => {
  const address = ctx.params.account.toLowerCase()
  const b = await AccountBalanceModel.findOne({ address  })
  if (!b){
    ctx.status = 404
    return
  }
  ctx.body = {address: b.address, balance: b.balance, account_type: await getAccountType(address) }
})

export default router
