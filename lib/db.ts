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
  parent: string
  version_onboarded: number
}

const PermissionNodeValidatorSchema = new Schema<PermissionNodeValidator>({
  address: { type: String, required: true },
  parent: { type: String, required: true },
  version_onboarded: { type: Number, required: true },
})

export const PermissionNodeValidatorModel = model<PermissionNodeValidator>(
  'PermissionNodeValidator',
  PermissionNodeValidatorSchema
)

export interface PermissionNodeMiner {
  address: string
  parent: string
  version_onboarded: number
  has_tower: boolean
  is_active: boolean
}

const PermissionNodeMinerSchema = new Schema<PermissionNodeMiner>({
  address: { type: String, required: true },
  parent: { type: String, required: true },
  version_onboarded: { type: Number, required: true },
  has_tower: { type: Boolean, required: true },
  is_active: { type: Boolean, required: true }
})

export const PermissionNodeMinerModel = model<PermissionNodeMiner>(
  'PermissionNodeMiner',
  PermissionNodeMinerSchema
)
