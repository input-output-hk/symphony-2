
import React, { Component } from 'react'

// import styles from './Sidebar.css'

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

    return (
      <div className={sidebarClassName}>
        <button className='expand' onClick={this.props.toggleSidebar} />
        <h1>Symphony</h1>
        <h2>Interactive Blockchain Map</h2>
        <div className='section key'>
          <h3>Transaction Value</h3>
          <div className='sidebar-show'><img alt='Transaction' src={txSingle} /></div>
          <div className='sidebar-hide'><img alt='Transaction key' src={txValueKey} /></div>
          <h3>Spending</h3>
          <div className='sidebar-show'><img alt='Transaction spending' src={txSpent} /></div>
          <div className='sidebar-hide'>
            <span className='spending-key'><img alt='Spent transaction' src={txSpent} /> <span>Spent</span></span>
            <span className='spending-key'><img alt='Unspent transaction' src={txUnspent} /> <span>Unspent</span></span>
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
            </li>
            <li>
              <button className='calendar' onClick={this.props.toggleSidebar} />
              <span onClick={this.props.toggleDateSearch}>Jump to Date</span>
            </li>
          </ul>
        </div>
        <div className='sidebar-footer'>
          <div className='sidebar-footer-inner'>
            <span className='iohk-supported'>IOHK Supported Project</span>
            <img className='iohk-logo' alt='IOHK Logo' src={iohkLogo} />
          </div>
        </div>
      </div>
    )
  }
}
