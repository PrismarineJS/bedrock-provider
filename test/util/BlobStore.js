class BlobStore extends Map {
  pending = {}
  wanted = []

  set(key, value) {
    const ret = super.set(key.toString(), value)
    this.wanted.forEach(wanted => wanted[0] = wanted[0].filter(hash => hash.toString() !== key.toString()))
    for (const [outstandingBlobs, cb] of this.wanted) {
      if (!outstandingBlobs.length) {
        cb()
      }
    }
    return ret
  }

  get(key) { return super.get(key.toString()) }
  has(key) { return super.has(key.toString()) }

  addPending(hash, blob) {
    this.pending[hash.toString()] = blob
  }

  updatePending(hash, value) {
    const name = hash.toString()
    if (this.pending[name]) {
      this.set(name, Object.assign(this.pending[name], value))
    } else {
      throw new Error('No pending blob for hash ' + name)
    }
    // todo: remove from pending
  }

  once(wantedBlobs, cb) {
    const outstanding = []
    for (const wanted of wantedBlobs) {
      if (!this.has(wanted)) outstanding.push(wanted)
    }

    if (outstanding.length) {
      this.wanted.push([outstanding, cb])
    } else {
      cb()
    }
  }
}

module.exports = BlobStore