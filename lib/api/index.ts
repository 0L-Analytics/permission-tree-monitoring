import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'

export default class API {
  host: string = null
  defaultHeaders: object = {}
  httpsAgent: any = null
  postProcessing: Function = null

  constructor(host, defaultHeaders?, httpsAgent?, postProcessing?) {
    this.host = host
    this.defaultHeaders = defaultHeaders
    this.httpsAgent = httpsAgent
    this.postProcessing = postProcessing
  }

  request = async (method, route, body, headers, config, query): Promise<AxiosResponse> => {
    const url = this.host + route
    const options: AxiosRequestConfig = {
      url,
      params: query,
      method,
      headers: { ...this.defaultHeaders, ...headers },
      ...(body && { data: body }),
      ...(this.httpsAgent && { httpsAgent: this.httpsAgent }),
      validateStatus: false,
      ...config,
    }

    const response = await axios(options)
    if (this.postProcessing) await this.postProcessing(response, options)

    if (response.status !== 200) console.log('Response error', response.status)

    return response
  }

  GET = async (route: string, query?: object, headers?: object, config?: AxiosRequestConfig): Promise<AxiosResponse> => await this.request('GET', route, null, headers, config, query)
  POST = async (route: string, body?: object, headers?: object, config?: AxiosRequestConfig): Promise<AxiosResponse> => await this.request('POST', route, body, headers, config, null)
  PATCH = async (route: string, body?: object, headers?: object, config?: AxiosRequestConfig): Promise<AxiosResponse> => await this.request('PATCH', route, body, headers, config, null)
  PUT = async (route: string, body?: object, headers?: object, config?: AxiosRequestConfig): Promise<AxiosResponse> => await this.request('PUT', route, body, headers, config, null)
  DELETE = async (route: string, body?: object, headers?: object, config?: AxiosRequestConfig): Promise<AxiosResponse> => await this.request('DELETE', route, body, headers, config, null)
}
