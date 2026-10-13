class MotionBuddyMicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) {
      const copy = channel.slice(0)
      this.port.postMessage(copy, [copy.buffer])
    }
    return true
  }
}
registerProcessor('motion-buddy-mic', MotionBuddyMicProcessor)
