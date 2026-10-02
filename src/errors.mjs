class EnvrefError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'EnvrefError'
    this.code = code
  }
}

export { EnvrefError }
