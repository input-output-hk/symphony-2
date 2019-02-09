import React, { Component } from 'react'

import styles from './WebVRButton.css'

export default class WebVRButton extends Component {
  constructor (props) {
    super(props)
    this.state = {
      vrActive: false
    }
  }

  toggleState () {
    if (this.state.vrActive) {
      this.props.endVRSession()
    } else {
      this.props.startVRSession()
    }

    this.setState({
      vrActive: !this.state.vrActive
    })
  }

  render () {
    let className = 'not-supported'

    if (this.props.VRSupported) {
      if (this.state.vrActive) {
        className = styles.exit
      } else {
        className = styles.enter
      }
    }

    return (
      <button
        title={this.state.vrActive ? 'Exit VR' : 'Enter VR'}
        onClick={this.toggleState.bind(this)}
        className={className}
      />
    )
  }
}
