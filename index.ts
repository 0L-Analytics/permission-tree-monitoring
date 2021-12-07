import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import http from 'http'
import permissionTreeRouter from './routers/permission-tree'
import epochsRouter from './routers/epochs'

const { PORT: ENV_PORT } = process.env
const PORT = ENV_PORT || 3027

const app = new Koa()
app.use(bodyParser())

app.use(permissionTreeRouter.routes())
app.use(epochsRouter.routes())

app.on('error', (error) => {
  console.error('App error', error)
})

const httpServer = http.createServer(app.callback())
httpServer.listen(PORT)
console.log('Listening on port', PORT)