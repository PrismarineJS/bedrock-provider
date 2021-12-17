// @ts-nocheck
import BinaryStream from '@jsprismarine/jsbinaryutils'

export class Stream extends BinaryStream {
  get offset() {
    return super.offset
  }

  set offset (offset: number) {
    super.offset = offset
  }

  peek () {
    return this.buffer[this.offset]
  }

  getBuffer () {
    return super.getBuffer() as Buffer & { startOffset }
  }
}
