import React, { Component } from 'react'
import styles from './Scope.css'

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
    if (this.props.config.detector.isMobile) {
      return null
    } else {
      return (
        <div className={styles.oscilloscope}>
          <div className={styles.scopeBorder} />
          <div className={styles.scopeGridContainer}>

            <div className={styles.scopeGridContainerChildTopLeft} />
            <div className={styles.scopeGridContainerChildTop} />
            <div className={styles.scopeGridContainerChildTop} />
            <div className={styles.scopeGridContainerChildTop} />
            <div className={styles.scopeGridContainerChildTop} />
            <div className={styles.scopeGridContainerChildTop} />
            <div className={styles.scopeGridContainerChildTop} />
            <div className={styles.scopeGridContainerChildTop} />

            <div className={styles.scopeGridContainerChildLeft} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />

            <div className={styles.scopeGridContainerChildLeft} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />

            <div className={styles.scopeGridContainerChildLeft} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />

            <div className={styles.scopeGridContainerChildLeft} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />

            <div className={styles.scopeGridContainerChildLeft} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />

            <div className={styles.scopeGridContainerChildLeft} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />

            <div className={styles.scopeGridContainerChildLeft} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />
            <div className={styles.scopeGridContainerChild} />

          </div>

          <canvas id={styles.scope} ref='scope' width='220' height='80' />
        </div>
      )
    }
  }
}
