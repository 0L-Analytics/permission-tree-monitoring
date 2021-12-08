import { Schema, model, connect } from 'mongoose'

const { MONGO_HOST, MONGO_INITDB_ROOT_USERNAME, MONGO_INITDB_ROOT_PASSWORD } = process.env

connect(`mongodb://${MONGO_HOST}`, {
  auth: {
    username: MONGO_INITDB_ROOT_USERNAME,
    password: MONGO_INITDB_ROOT_PASSWORD,
  },
})

export interface PermissionNodeValidator {
  address: string
  operator_address: string
  parent: string
  epoch_onboarded: number
  version_onboarded: number
}

const PermissionNodeValidatorSchema = new Schema<PermissionNodeValidator>({
  address: { type: String, required: true },
  operator_address: { type: String, required: true},
  parent: { type: String, required: true },
  epoch_onboarded: { type: Number, required: true },
  version_onboarded: { type: Number, required: true },
})

export const PermissionNodeValidatorModel = model<PermissionNodeValidator>(
  'PermissionNodeValidator',
  PermissionNodeValidatorSchema
)

export interface PermissionNodeMiner {
  address: string
  parent: string
  epoch_onboarded: number
  version_onboarded: number
  has_tower: boolean
  is_active: boolean
}

const PermissionNodeMinerSchema = new Schema<PermissionNodeMiner>({
  address: { type: String, required: true },
  parent: { type: String, required: true },
  epoch_onboarded: { type: Number, required: true },
  version_onboarded: { type: Number, required: true },
  has_tower: { type: Boolean, required: true },
  is_active: { type: Boolean, required: true }
})

export const PermissionNodeMinerModel = model<PermissionNodeMiner>(
  'PermissionNodeMiner',
  PermissionNodeMinerSchema
)

export interface Epoch {
  epoch: number
  height: number
  timestamp: number
  miner_payment_total: number
}

const EpochSchema = new Schema<Epoch>({
  epoch: { type: Number, required: true },
  height: { type: Number, required: true },
  timestamp: { type: Number, required: true },
  miner_payment_total: { type: Number, required: true },
})

export const EpochSchemaModel = model<Epoch>(
  'Epoch',
  EpochSchema
)

export interface MinerEpochStats {
  address: string
  epoch: number
  count: number
}

const MinerEpochStatsSchema = new Schema<MinerEpochStats>({
  address: { type: String, required: true},
  epoch: { type: Number, required: true },
  count: { type: Number, required: true },
})

export const MinerEpochStatsSchemaModel = model<MinerEpochStats>(
  'MinerEpochStats',
  MinerEpochStatsSchema
)