// @ts-nocheck
import BinaryStream from '@jsprismarine/jsbinaryutils'

export class Stream extends BinaryStream {
  offset
  peek () {
    return this.buffer[this.offset]
  }

  getBuffer () {
    return super.getBuffer() as Buffer & { startOffset }
  }
}
