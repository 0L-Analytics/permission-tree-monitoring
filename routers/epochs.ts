import Router from '@koa/router'
import {
  MinerEpochStatsSchemaModel,
  EpochSchemaModel,
  PermissionNodeValidatorModel,
} from '../lib/db'

const router = new Router({ prefix: '/epochs' })

router.get('/', async (ctx) => {
  const epochs = await EpochSchemaModel.find().sort([['epoch', -1]])
  ctx.body = epochs.map((epoch) => ({
    epoch: epoch.epoch,
    height: epoch.height,
    timestamp: epoch.timestamp,
  }))
})

router.get('/proofs/sum', async (ctx) => {
  const validatorsRes = await PermissionNodeValidatorModel.find()
  const validatorsAddresses = [
    ...validatorsRes.map((validator) => validator.address),
    ...validatorsRes.map((validator) => validator.operator_address),
  ]

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
                  { $gte: ['$count', 7] },
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
                  { $gte: ['$count', 7] },
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
  }))
})

router.get('/proofs/sum/:epoch', async (ctx) => {
  const { epoch: epochString } = ctx.params
  const epoch = parseInt(epochString)
  const epochSumRes = await MinerEpochStatsSchemaModel.aggregate([
    { $match: { epoch } },
    {
      $group: {
        _id: '$epoch',
        proofs: { $sum: '$count' },
        miners: { $sum: 1 },
      },
    },
  ])
  if (epochSumRes.length === 0) {
    ctx.status = 404
    return
  }
  ctx.body = {
    epoch,
    proofs: epochSumRes[0].proofs,
    miners: epochSumRes[0].miners,
  }
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
  const { address } = ctx.params
  const epochStats = await MinerEpochStatsSchemaModel.find({ address }).sort([
    ['epoch', -1],
  ])
  ctx.body = epochStats.map((epochStat) => ({
    epoch: epochStat.epoch,
    count: epochStat.count,
  }))
})

export default router
