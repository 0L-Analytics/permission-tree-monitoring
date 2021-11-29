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
```

### Get Validator Permission Tree

`GET /permission-tree/validator/:address`

```typescript
interface PermissionNodeValidator {
  address: string // Address of this validator
  parent: string // Address of validator that onboarded this validator
  version_onboarded: number // Height when validator was onboarded
}

interface ValidatorPermissionTreeResponse extends PermissionNodeValidator {
  children: PermissionNodeValidator[]
}
```

### Get Miner Permission Tree

`GET /permission-tree/miner/:address`

```typescript
interface PermissionNodeMiner {
  address: string // Address of this validator
  parent: string // Address of validator that onboarded this validator
  version_onboarded: number // Height when validator was onboarded
  has_tower: boolean // Does miner have tower height > 0 ?
  is_active: boolean // Has miner submitted proofs in current epoch?
}

interface MinerPermissionTreeResponse extends PermissionNodeMiner {
  children: PermissionNodeMiner[]
}
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