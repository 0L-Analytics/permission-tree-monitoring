import Router from '@koa/router'
import {
  AccountBalanceModel
} from '../lib/db'


const router = new Router({ prefix: '/balances' })

router.get('/', async (ctx) => {
  let balancesQuery
  const { account_type } = ctx.request.query
  if (account_type) {
    balancesQuery = AccountBalanceModel.find({accountType: account_type})
  } else {
    balancesQuery = AccountBalanceModel.find()
  }
  const balances = await balancesQuery.sort([['balance', -1]])
  ctx.body = balances.map(b => ({address: b.address, balance: b.balance, account_type: b.accountType }))
})

router.get('/:account', async (ctx) => {
  const b = await AccountBalanceModel.findOne({ address: ctx.params.account.toLowerCase() })
  if (!b){
    ctx.status = 404
    return
  }
  ctx.body = {address: b.address, balance: b.balance, account_type: b.accountType }
})

export default router
