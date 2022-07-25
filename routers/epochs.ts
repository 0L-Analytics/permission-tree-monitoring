import Router from '@koa/router'
import {
  MinerEpochStatsSchemaModel,
  EpochSchemaModel,
  PermissionNodeValidatorModel,
} from '../lib/db'
import { getTransactions } from '../lib/api/node'
import { get } from 'lodash'

const router = new Router({ prefix: '/epochs' })

router.get('/', async (ctx) => {
  const epochs = await EpochSchemaModel.find().sort([['epoch', -1]])
  ctx.body = epochs.map((epoch) => ({
    epoch: epoch.epoch,
    height: epoch.height,
    timestamp: epoch.timestamp,
  }))
})

router.get('/proofs/payments/:epoch', async (ctx) => {
  const { epoch: epochString } = ctx.params
  const epoch = parseInt(epochString)
  const epochRecord = await EpochSchemaModel.findOne({ epoch: epoch + 1 })
  if (!epochRecord) {
    ctx.status = 404
    return
  }

  const transaction = await getTransactions({ startVersion: epochRecord.height, limit: 1, includeEvents: true })
  const validatorsRes = await PermissionNodeValidatorModel.find()
  const validatorsAddresses = [
    ...validatorsRes.map((validator) => validator.address),
    ...validatorsRes.map((validator) => validator.operator_address),
  ]

  let minerPayment = 0
  let minerPayableCount = 0

  for (const event of transaction.data.result[0].events) {
    if (validatorsAddresses.indexOf(get(event, 'data.receiver')) !== -1) continue
    if (event.data.sender === '00000000000000000000000000000000' && event.data.type === 'receivedpayment') {
      minerPayment += event.data.amount.amount
      minerPayableCount++
    }
  }

  ctx.body = {
    minerPayment: minerPayment / 1000000,
    minerPayableCount
  }
})

router.get('/proofs/sum', async (ctx) => {
  const validatorsRes = await PermissionNodeValidatorModel.find()
  const validatorsAddresses = [
    ...validatorsRes.map((validator) => validator.address),
    ...validatorsRes.map((validator) => validator.operator_address),
  ]

  const epochRecords = await EpochSchemaModel.find()
  const minerPayments = {}
  for (const epoch of epochRecords) {
    minerPayments[epoch.epoch] = epoch.miner_payment_total
  }

  const epochSumRes = await MinerEpochStatsSchemaModel.aggregate([
    {
      $group: {
        _id: '$epoch',
        totalProofs: { $sum: '$count' },
        miners: { $sum: 1 },
        validatorProofs: {
          $sum: {
            $cond: [
              {
                $setIsSubset: [
                  {
                    $map: {
                      input: ['A'],
                      as: 'el',
                      in: '$address',
                    },
                  },
                  validatorsAddresses,
                ],
              },
              '$count',
              0,
            ],
          },
        },
        minersPayable: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $not: [
                      {
                        $setIsSubset: [
                          {
                            $map: {
                              input: ['A'],
                              as: 'el',
                              in: '$address',
                            },
                          },
                          validatorsAddresses,
                        ],
                      },
                    ],
                  },
                  { $gte: ['$count', 8] },
                ],
              },

              1,
              0,
            ],
          },
        },
        minerProofsPayable: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $not: [
                      {
                        $setIsSubset: [
                          {
                            $map: {
                              input: ['A'],
                              as: 'el',
                              in: '$address',
                            },
                          },
                          validatorsAddresses,
                        ],
                      },
                    ],
                  },
                  { $gte: ['$count', 8] },
                ],
              },

              '$count',
              0,
            ],
          },
        },
      },
    },
    { $sort: { _id: -1 } },
  ])
  if (epochSumRes.length === 0) {
    ctx.status = 404
    return
  }
  ctx.body = epochSumRes.map((epochSum) => ({
    epoch: epochSum._id,
    miners: epochSum.miners,
    proofs: epochSum.totalProofs,
    validator_proofs: epochSum.validatorProofs,
    miner_proofs: epochSum.totalProofs - epochSum.validatorProofs,
    miners_payable: epochSum.minersPayable,
    miners_payable_proofs: epochSum.minerProofsPayable,
    miner_payment_total: minerPayments[epochSum._id]
  }))
})


router.get('/proofs/sum/:epoch', async (ctx) => {
  const { epoch: epochString } = ctx.params
  const epoch = parseInt(epochString)

  const validatorsRes = await PermissionNodeValidatorModel.find()
  const validatorsAddresses = [
    ...validatorsRes.map((validator) => validator.address),
    ...validatorsRes.map((validator) => validator.operator_address),
  ]

  const epochRecords = await EpochSchemaModel.findOne({epoch})


  const epochSumRes = await MinerEpochStatsSchemaModel.aggregate([
    { $match: { epoch } },
    {
      $group: {
        _id: '$epoch',
        totalProofs: { $sum: '$count' },
        miners: { $sum: 1 },
        validatorProofs: {
          $sum: {
            $cond: [
              {
                $setIsSubset: [
                  {
                    $map: {
                      input: ['A'],
                      as: 'el',
                      in: '$address',
                    },
                  },
                  validatorsAddresses,
                ],
              },
              '$count',
              0,
            ],
          },
        },
        minersPayable: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $not: [
                      {
                        $setIsSubset: [
                          {
                            $map: {
                              input: ['A'],
                              as: 'el',
                              in: '$address',
                            },
                          },
                          validatorsAddresses,
                        ],
                      },
                    ],
                  },
                  { $gte: ['$count', 8] },
                ],
              },

              1,
              0,
            ],
          },
        },
        minerProofsPayable: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $not: [
                      {
                        $setIsSubset: [
                          {
                            $map: {
                              input: ['A'],
                              as: 'el',
                              in: '$address',
                            },
                          },
                          validatorsAddresses,
                        ],
                      },
                    ],
                  },
                  { $gte: ['$count', 8] },
                ],
              },

              '$count',
              0,
            ],
          },
        },
      },
    },
    { $sort: { _id: -1 } },
  ])
  if (epochSumRes.length === 0) {
    ctx.status = 404
    return
  }
  ctx.body = epochSumRes.map((epochSum) => ({
    epoch: epochSum._id,
    miners: epochSum.miners,
    proofs: epochSum.totalProofs,
    validator_proofs: epochSum.validatorProofs,
    miner_proofs: epochSum.totalProofs - epochSum.validatorProofs,
    miners_payable: epochSum.minersPayable,
    miners_payable_proofs: epochSum.minerProofsPayable,
    miner_payment_total: epochRecords.miner_payment_total
  }))[0]
})

router.get('/proofs/histogram/:epoch', async (ctx) => {
  const { epoch: epochString } = ctx.params
  const epoch = parseInt(epochString)
  const boundaries = []
  for (let i = 0; i < 74; i++) boundaries.push(i)
  const epochSumRes = await MinerEpochStatsSchemaModel.aggregate([
    { $match: { epoch } },
    {
      $bucket: {
        groupBy: '$count',
        boundaries,
        default: 'invalid',
      },
    },
  ])
  if (epochSumRes.length === 0) {
    ctx.status = 404
    return
  }
  ctx.body = epochSumRes.map((boundary, i) => ({
    proofs: boundary._id,
    count: boundary.count,
  }))
})

router.get('/proofs/:address', async (ctx) => {
  const address = ctx.params.address.toLowerCase()
  const epochStats = await MinerEpochStatsSchemaModel.find({ address }).sort([
    ['epoch', -1],
  ])
  ctx.body = epochStats.map((epochStat) => ({
    epoch: epochStat.epoch,
    count: epochStat.count,
  }))
})

router.get('/:epoch', async (ctx) => {
  const epoch = await EpochSchemaModel.findOne({ epoch: ctx.params.epoch })
  if (!epoch){
    ctx.status = 404
    return
  }
  ctx.body = {
    epoch: epoch.epoch,
    height: epoch.height,
    timestamp: epoch.timestamp,
  }
})

export default router
