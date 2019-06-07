
import React, { Component } from 'react'

import iohkLogo from '../../assets/images/iohk-logo.png'
import txValueKey from '../../assets/images/tx-value-key.png'
import txSpent from '../../assets/images/tx-spent.svg'
import txUnspent from '../../assets/images/tx-unspent.svg'
import txSingle from '../../assets/images/tx-single.png'

export default class WebVRButton extends Component {
  render () {
    let sidebarClassName = 'sidebar'

    if (this.props.sidebarOpen) {
      sidebarClassName += ' open'
    } else {
      sidebarClassName += ' closed'
    }

    sidebarClassName += this.props.animatingCamera ? ' camera-animating' : ''

    return (
      <div className={sidebarClassName}>
        <button className='expand' onClick={this.props.toggleSidebar} />
        <h1>Symphony</h1>
        <h2>3D Blockchain Explorer</h2>
        <div className='section key'>
          <h3>Transaction Value</h3>
          <div className='sidebar-show'><img alt='Transaction' src={txSingle} /></div>
          <div className='sidebar-hide'><img alt='Transaction Key' src={txValueKey} /></div>
          <h3>Spending</h3>
          <div className='sidebar-show'><img alt='Transaction Spending' src={txSpent} /></div>
          <div className='sidebar-hide'>
            <span className='spending-key'><img alt='Spent Transaction' src={txSpent} /> <span>Spent</span></span>
            <span className='spending-key'><img alt='Unspent Transaction' src={txUnspent} /> <span>Unspent</span></span>
          </div>
        </div>
        <div className='section explore'>
          <h3>Explore</h3>
          <ul>
            <li>
              <button className='search' onClick={this.props.toggleSidebar} />
              <span onClick={this.props.toggleBlockSearch}>Locate Block</span>
              <span onClick={this.props.toggleTxSearch}>Locate Transaction</span>
              <span onClick={this.props.goToRandomBlock}>Random Block</span>
              <span onClick={() => { this.props.goToBlock(this.props.maxHeight, true) }}>Latest Block</span>
            </li>
          </ul>
        </div>
        <div className='sidebar-footer'>
          <div className='sidebar-footer-inner'>
            <a href='https://iohk.io'>
              <span className='iohk-supported'>IOHK Supported Project</span>
              <img className='iohk-logo' alt='IOHK Logo' src={iohkLogo} />
            </a>
          </div>
        </div>
      </div>
    )
  }
}
