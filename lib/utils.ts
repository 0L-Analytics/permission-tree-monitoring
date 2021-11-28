import { Vitals } from './types/0l'
import EventSource from 'eventsource'

const { NODE_HOSTNAME } = process.env

export const getVitals: Promise<Vitals> = new Promise((res, rej) => {
  const uri = `http://${NODE_HOSTNAME}:3030/vitals`
  try {
    const sse = new EventSource(uri)
    sse.onmessage = (msg) => {
      sse.close()
      res(JSON.parse(msg.data))
    }
    sse.onerror = (err) => {
      sse.close()
      rej(err)
    }
  } catch (err) {
    rej(err)
  }
})
