
import React, { Component } from 'react'
import moment from 'moment'

import Scope from '../Scope/Scope'

export default class BlockDetails extends Component {
  UIUndersideButton () {
    switch (this.props.controlType) {
      case 'underside':
      case 'fly':
        return (
          <div className='flip-view-container'>
            <button tooltip='Show Block Top' onClick={this.props.toggleTopView} className='flip-view' />
          </div>
        )
      case 'top':
        return (
          <div className='flip-view-container'>
            <button tooltip='Side View' onClick={this.props.toggleSideView} className='flip-view' />
          </div>
        )
      case 'side':
        return (
          <div className='flip-view-container'>
            <button tooltip='Bottom View' onClick={this.props.toggleUndersideView} className='flip-view' />
          </div>
        )

      default:
        break
    }
  }

  UITXDetails () {
    if (this.props.txSelected) {
      return (
        <div className='tx-details'>
          <div className='tx-details-border tx-details-border-tl' />
          <div className='tx-details-border tx-details-border-tr' />
          <div className='tx-details-border tx-details-border-bl' />
          <div className='tx-details-border tx-details-border-br' />

          <div className='tx-details-inner'>
            <h2><a target='_blank' href={'https://www.blockchain.com/btc/tx/' + this.props.txSelected.hash}>TX-{this.props.txSelected.hash}</a></h2>

            <span className='tx-detail-item'><strong>{ moment.unix(this.props.txSelected.time).format('YYYY-MM-DD HH:mm:ss') }</strong></span>
            <span className='tx-detail-item'><strong>{this.props.txSelected.size} bytes</strong></span>
            <span className='tx-detail-item'><h3>Relayed By:</h3> <strong>{this.props.txSelected.relayed_by}</strong></span>
            <span className='tx-detail-item'><h3>Fee:</h3> <i className='fab fa-btc' /><strong>{this.props.txSelected.fee}</strong></span>

            <ul className='input-output'>
              <li className='inputs'><h3>Inputs:</h3>
                <ul>
                  {this.props.txSelected.inputs.slice(0, 5).map(function (el, index) {
                    return <li key={index}><i className='fab fa-btc' />
                      { typeof el.prev_out !== 'undefined' ? el.prev_out.value / 100000000 : 0 }</li>
                  })}
                  {this.props.txSelected.inputs.length > 5 ? '...' : ''}
                </ul>
              </li>

              <li className='outputs'><h3>Outputs:</h3>
                <ul>
                  {this.props.txSelected.out.slice(0, 5).map(function (el, index) {
                    return <li key={index}><i className='fab fa-btc' />{el.value / 100000000} ({el.spent ? 'Spent' : 'Unspent'})</li>
                  })}
                  {this.props.txSelected.out.length > 5 ? '...' : ''}
                  <li className='out-total'><strong>Total:</strong> <i className='fab fa-btc' />{(this.props.txSelected.outTotal).toFixed(2)}</li>
                </ul>
              </li>
            </ul>

          </div>
        </div>
      )
    }
  }

  UICockpitButton () {
    if (this.props.config.scene.mode === 'full') {
      if (this.props.controlType === 'fly') {
        return (
          <div className='explore-container'>
            <button tooltip='Exit Flight Simulator' onClick={this.props.toggleTopView} className='toggle-cockpit-controls leave' />
            <span tooltip='Exit Flight Simulator' className='cancel' onClick={this.props.toggleTopView} />
          </div>
        )
      } else {
        return (
          <div className='explore-container'>
            <button tooltip='Flight Simulator Mode' onClick={this.props.toggleFlyControls} className='toggle-cockpit-controls enter' />
          </div>
        )
      }
    }
  }

  UIAutoPilot () {
    if (this.props.config.scene.mode === 'full') {
      return (
        <div className='autopilot-controls'>
          <div className='autopilot-inner'>
            <span tooltip='Auto-pilot back in time' className='backward' onClick={() => this.props.toggleAutoPilotDirection('backward')} />
            <span tooltip='Stop Auto Pilot' className='stop' onClick={() => this.props.stopAutoPilot()} />
            <span tooltip='Auto-pilot forwards in time' className='forward' onClick={() => this.props.toggleAutoPilotDirection('forward')} />
          </div>
        </div>
      )
    }
  }

  UIIntroOverlay () {
    let className = 'intro-overlay'
    if (this.props.showInfoOverlay) {
      return (
        <div className={className}>
          <p className='intro-overlay-merkle'>Cycle Through Views&nbsp;&rarr;</p>
          <p className='intro-overlay-free-explore'>&uarr;<br />Flight Simulator Mode</p>
          <p className='intro-overlay-autopilot'>&larr;&nbsp;Autopilot controls</p>
          <p className='intro-overlay-sidebar'>&larr;&nbsp;Search for Blocks and Transactions</p>
          <button className='intro-overlay-start-explore action-button' onClick={this.props.toggleInfoOverlay} onMouseEnter={this.props.playButtonSound}>
            <span className='tl' />
            <span className='tr' />
            <span className='bl' />
            <span className='br' />
            <div className='swipe' />
            <p>Start Exploring</p>
          </button>
        </div>
      )
    }
  }

  UICockpitInfoOverlay () {
    if (this.props.controlType === 'fly' && this.props.flyControlsInteractionCount < 2) {
      return (
        <div className='free-explore-info-overlay'>
          <p>Flight Simulator mode lets you fly around the Blockchain and listen to the sounds of each block
            <br />
            <br />
          Press these keys to navigate:
          </p>
          <div className='free-explore-keys'>
            <div className='free-explore-key-container'>
              <div className='free-explore-key'>Q</div> <p className='key-q'>Rotate left</p>
            </div>
            <div className='free-explore-key-container'>
              <div className='free-explore-key'>W</div> <p className='key-w'>Move forward</p>
            </div>
            <div className='free-explore-key-container'>
              <div className='free-explore-key'>E</div> <p className='key-e'>Rotate right</p>
            </div>
            <div className='free-explore-key-container'>
              <div className='free-explore-key'>A</div><p className='key-a'>Move left</p>
            </div>
            <div className='free-explore-key-container'>
              <div className='free-explore-key'>S</div> <p className='key-s'>Move backward</p>
            </div>
            <div className='free-explore-key-container'>
              <div className='free-explore-key'>D</div> <p className='key-d'>Move right</p>
            </div>
          </div>
          <button className='go-button action-button' onClick={this.props.closeFlyInfo.bind(this)} onMouseEnter={this.props.playButtonSound}>
            <span className='tl' />
            <span className='tr' />
            <span className='bl' />
            <span className='br' />
            <div className='swipe' />
            <p>Start</p>
          </button>

        </div>
      )
    }
  }

  UICockpit () {
    if (this.props.controlType === 'fly' && this.props.flyControlsInteractionCount > 1) {
      return (
        <div className='hud'>
          <div className='coords'>
            <div className='posX'>X: { this.props.posX }</div>
            <div className='posY'>Y: { this.props.posY }</div>
            <div className='posZ'>Z: { this.props.posZ }</div>
          </div>
        </div>
      )
    }
  }

  UIBlockNavigation () {
    let nextButtonClassName = 'block-navigation-next'
    if (
      this.props.closestBlock.blockData.height === this.props.maxHeight ||
      this.props.controlType === 'fly'
    ) {
      nextButtonClassName += ' hide'
    }

    let prevButtonClassName = 'block-navigation-prev'
    if (
      this.props.closestBlock.blockData.height === 0 ||
      this.props.controlType === 'fly'
    ) {
      prevButtonClassName += ' hide'
    }

    if (
      this.props.controlType === 'underside' ||
      this.props.controlType === 'top' ||
      this.props.controlType === 'side'
    ) {
      return (
        <div className='block-navigation'>
          <button tooltip='Previous Block' onClick={() => { this.props.toggleInfoOverlay(); this.props.gotoPrevBlock() }} className={prevButtonClassName}>Previous Block</button>
          <button tooltip='Next Block' onClick={() => { this.props.toggleInfoOverlay(); this.props.gotoNextBlock() }} className={nextButtonClassName}>Next Block</button>
        </div>

      )
    }
  }

  infoPanelContent () {
    switch (this.props.controlType) {
      case 'underside':
        return (
          <div>
            <p>Merkle Trees allow efficient and secure verification of large data sets.</p>
            <p>The branches of the tree connect to the transactions above.</p>
            <p>Merkle Trees cryptographically link one block to the next.</p>
          </div>
        )

      default:
        return (
          <div>
            <p>Transactions are shown as crystals; height is value, brightness is spent output ratio.</p>
            <p>Each crystal creates sound based on value, spent outputs and fee.</p>
            <p>Sounds are cycled through in the order the transactions were made.</p>
          </div>
        )
    }
  }

  audioMuteControls () {
    if (this.props.audioMuted) {
      return (
        <div className='volume-controls'>
          <i className='fas fa-volume-mute' onClick={this.props.unMuteAudio} />
        </div>
      )
    } else {
      return (
        <div className='volume-controls'>
          <i className='fas fa-volume-up' onClick={this.props.muteAudio} />
        </div>
      )
    }
  }

  render () {
    if (this.props.closestBlock) {
      const health = this.props.closestBlock.blockData.healthRatio > 1.0 ? 1.0 : this.props.closestBlock.blockData.healthRatio
      const healthInv = (1.0 - health)

      let className = 'block-details-container'

      let gradClass = ''
      if (this.props.controlType === 'fly') {
        gradClass = 'hide'
        className += ' cockpit'
      }

      let txSelectedClass = ''
      if (this.props.txSelected) {
        txSelectedClass = ' tx-selected'
      }

      return (
        <div className={className}>

          <div className='cockpit-border' />

          {this.UICockpitInfoOverlay()}
          {this.UIIntroOverlay()}
          {this.UICockpit()}
          {this.UICockpitButton()}
          {this.UIAutoPilot()}

          <div className={'grad-left' + gradClass} />
          <div className={'grad-right' + gradClass} />

          {this.UIUndersideButton()}
          {this.UITXDetails()}
          <div className='block-hash'>
            <h2>//BLOCK-{ this.props.closestBlock.blockData.height }</h2>
            <h3>{ this.props.closestBlock.blockData.hash }</h3>
          </div>

          {this.UIBlockNavigation()}

          <div className={'block-details ' + txSelectedClass}>
            <h2 className='block-details-heading'>//BLOCK-{this.props.closestBlock.blockData.height}</h2>
            <div className='block-details-border' />
            <div className='block-details-inner'>
              <ul>
                <li><h3>Health:</h3> <div className='health-bar-container' tooltip={healthInv}>
                  <div
                    className='health-bar'
                    style={{
                      width: 100 * healthInv,
                      background: 'rgba(' + 255 * healthInv + ', ' + 255 * healthInv + ', ' + 255 * healthInv + ', 1.0)'
                    }}
                  />
                </div>
                </li>
                <li><h3>No. of Tx:</h3> <strong>{ this.props.closestBlock.blockData.n_tx }</strong></li>
                <li><h3>Output:</h3> <i className='fab fa-btc' /><strong>{ (this.props.closestBlock.blockData.outputTotal / 100000000).toFixed(2) }</strong></li>
                <li><h3>Fees:</h3> <i className='fab fa-btc' /><strong>{ (this.props.closestBlock.blockData.fee / 100000000).toFixed(2) }</strong></li>
                <li><h3>Date:</h3> <strong>{ moment.unix(this.props.closestBlock.blockData.time).format('HH:mm DD/MM/YY') }</strong></li>
                <li><h3>Bits:</h3> <strong>{ this.props.closestBlock.blockData.bits }</strong></li>
                <li><h3>Size:</h3> <strong>{ this.props.closestBlock.blockData.size / 1000 } KB</strong></li>
                <li><h3>Height:</h3> <strong>{ this.props.closestBlock.blockData.height }</strong></li>
                <li><h3>Merkle Root:</h3> <strong>{ this.props.closestBlock.blockData.mrkl_root.substring(0, 10) }</strong></li>
                <li><h3>Nonce:</h3> <strong>{ this.props.closestBlock.blockData.nonce }</strong></li>
                <li><h3>Version:</h3> <strong>{ this.props.closestBlock.blockData.ver }</strong></li>
                <li className='view-details'><h3><strong><a target='_blank' href={'https://www.blockchain.com/btc/block-height/' + this.props.closestBlock.blockData.height}>View Details</a></strong></h3></li>
              </ul>
            </div>
          </div>

          <div className='info-panel'>
            <div className='info-panel-inner'>
              <div className='info-panel-border' />
              {this.infoPanelContent()}
            </div>

            {this.audioMuteControls()}

            <Scope
              config={this.props.config}
            />
          </div>

        </div>
      )
    } else {
      return (
        <div />
      )
    }
  }
}
