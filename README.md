# 0L Permission Tree

[koa.js](https://koajs.com/) API to fetch 0L permission trees for miners and validators.

## API Spec

### Get Statistics

`GET /permission-tree/stats`

```typescript
interface StatsResponse {
  allAccountCount: number, // All accounts
  allMinerCount: number, // All accounts with tower height > 0
  activeMinerCount: number // All accounts that have submitted proofs in current epoch
}

const response: StatsResponse
```

### Get Validator Permission Tree

`GET /permission-tree/validator/:address`

```typescript
interface PermissionNodeValidator {
  address: string // Address of this validator
  operator_address: string // Operator address of this validator
  parent: string // Address of validator that onboarded this validator
  version_onboarded: number // Height when validator was onboarded
  epoch_onboarded: number // Epoch when validator was onboarded
}

interface ValidatorPermissionTreeResponse extends PermissionNodeValidator {
  children: PermissionNodeValidator[]
}

const response: ValidatorPermissionTreeResponse
```

### Get Validator information from operator account

`GET /permission-tree/operator/:address`

```typescript
const response: ValidatorPermissionTreeResponse
```

### Get all Validators

`GET /permission-tree/validators`

```typescript
const response: PermissionNodeValidator[]
```

### Get Miner Permission Tree

`GET /permission-tree/miner/:address`

```typescript
interface PermissionNodeMiner {
  address: string // Address of this account
  parent: string // Address of validator that onboarded this account
  version_onboarded: number // Height when account was onboarded
  epoch_onboarded: number // Epoch when account was onboarded
}

interface MinerPermissionTreeResponse extends PermissionNodeMiner {
  children: PermissionNodeMiner[]
}

const response: MinerPermissionTreeResponse
```

### Get Epochs

`GET /epochs`

```typescript
interface EpochsResponse {
  epoch: number
  height: number
  timestamp: number
}

const response: EpochsResponse[]
```

### Get Miner Proof Counts for all Epochs

`GET /epochs/proofs/:address`

```typescript
interface MinerEpochsProofsResponse {
  epoch: number
  count: number // Total number of proofs in epoch for this miner
}

const response: MinerEpochsProofsResponse[]
```

### Get Epoch Total Miner Proof Counts for Epoch

`GET /epochs/proofs/sum/:epoch`

```typescript
interface EpochProofsResponse {
  epoch: number
  miners: number
  proofs: number // Total number of miner proofs in epoch for all miners
  validator_proofs: number // How many of the proofs were by validators
  miner_proofs: number // How many of the proofs were by miners
  miners_payable: number // Number of miners that are above payment threshold
  miners_payable_proofs: number // Total number of proofs submitted by miners that are above the payment threshold
}
```

### Get Epoch Total Miner Proof Counts

`GET /epochs/proofs/sum`

```typescript
const response: EpochProofsResponse[]
```

### Get Epoch Total Miner Proof Count Histogram for Epoch

`GET /epochs/proofs/histogram/:epoch`

```typescript
interface EpochProofsHistogramResponse {
  proofs: number
  count: number // miners with this total number of proofs for the specified epoch
}

const response: EpochProofsHistogramResponse[]
```

### Get Account Balances

`GET /balances`

```typescript
interface BalanceResponse {
  address: string
  balance: number
  account_type: string // one of: "community", "validator", "miner", or "basic
}

const response: BalanceResponse[]
```

### Get Account Balances for specific account type

`GET /balances?account_type=validator`

```typescript
const response: BalanceResponse[]
```

### Get Account Balances for specific account

`GET /balances/<address>`

```typescript
const response: BalanceResponse
```

## Setup

Install [docker](https://docs.docker.com/get-docker/) and [docker-compose](https://docs.docker.com/compose/install/)

## Launch Dev Environment

Set an active upstream node hostname in docker-compose.yml for `NODE_HOSTNAME`

Launch Application

```bash
docker-compose up
```

API is now alive at [http://localhost:3028](http://localhost:3028)

- If changes are made to server-side files, the app will restart.

To restart application manually:

```bash
docker-compose down
docker-compose up
```

## Re-build docker image

If node_modules are changed or Dockerfile is modified, re-build the image with:
```bash
docker-compose build
```

## Build for production

```bash
docker build --no-cache -t 0l-permission-tree .
```

Now distribute the `0l-permission-tree:latest` docker image to your desired container orchestration platform.
An example kubernetes template file is provided in [0l-permission-tree.yml](0l-permission-tree.yml).

Replace `$NODE_HOSTNAME$`, `$CONTAINER_IMAGE$`, `$MONGO_HOST$`, `$MONGO_INITDB_ROOT_USERNAME$`, and `$MONGO_INITDB_ROOT_PASSWORD$` in the template with valid values for the node to use for RPC calls, and the container repository URL, respectively.

It can be deployed with:

```bash
kubectl apply -f 0l-permission-tree.yml
```

## Donations

If you would like to contribute to this project financially, please send to one of the following addresses:

- 0L (GAS) - 4be425e5306776a0bd9e2db152b856e6
- Cosmos (ATOM) - cosmos1zq3r93gs6smvxvmflwwppe930p4wcrc7nwlcp0