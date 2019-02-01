import React, { Component } from 'react'

import styles from './Scope.css'

let canvas = document.createElement('canvas')

export default class Scope extends Component {
  constructor (props) {
    super(props)

    window.oscilloscope = this // TODO: find a better way around exposing this global
  }

  drawScope (analyser, canvas) {
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    const width = ctx.canvas.width
    const height = ctx.canvas.height
    const timeData = new Uint8Array(analyser.frequencyBinCount)
    const scaling = height / 256
    let risingEdge = 0
    const edgeThreshold = 5

    analyser.getByteTimeDomainData(timeData)

    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    ctx.fillRect(0, 0, width, height)

    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgb(255, 255, 255)'
    ctx.beginPath()

    // No buffer overrun protection
    while (timeData[risingEdge++] - 128 > 0 && risingEdge <= width);
    if (risingEdge >= width) {
      risingEdge = 0
    }

    while (timeData[risingEdge++] - 128 < edgeThreshold && risingEdge <= width);
    if (risingEdge >= width) {
      risingEdge = 0
    }

    for (var x = risingEdge; x < timeData.length && x - risingEdge < width; x++) {
      ctx.lineTo(x - risingEdge, height - timeData[x] * scaling)
    }

    ctx.stroke()
  }

  render () {
    return (
      <div>
        <div className='scope-border' />
        <div className='scope-grid-container'>

          <div className='top left' />
          <div className='top' />
          <div className='top' />
          <div className='top' />
          <div className='top' />
          <div className='top' />
          <div className='top' />
          <div className='top' />

          <div className='left' />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />

          <div className='left' />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />

          <div className='left' />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />

          <div className='left' />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />

          <div className='left' />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />

          <div className='left' />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />

          <div className='left' />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />

        </div>

        <canvas id='scope' ref='scope' width='220' height='80' />
      </div>
    )
  }
}
