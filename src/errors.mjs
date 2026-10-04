class ResenvError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'ResenvError'
    this.code = code
  }
}

export { ResenvError }
