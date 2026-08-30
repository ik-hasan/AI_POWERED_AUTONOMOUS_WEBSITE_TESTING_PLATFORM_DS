export class ExecutionAbortedError extends Error {
  constructor(message = 'Execution aborted by user') {
    super(message);
    this.name = 'ExecutionAbortedError';//Must call super constructor in derived class before accessing 'this'
  }
}
