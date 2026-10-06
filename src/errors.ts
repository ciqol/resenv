class ResenvError extends Error {
  readonly code: string

  constructor (code: string, message: string) {
    super(message)
    this.name = 'ResenvError'
    this.code = code
  }
}

export { ResenvError }
