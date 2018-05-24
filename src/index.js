import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'
import App from './App'

let Component

const init = function (config) {
  Component = ReactDOM.render(<App config={config} />, document.getElementById('symphony-root'))
}

/**
 * Check if the app can run
 */
const canRun = function () {
  if (!window.WebGLRenderingContext) {
    console.log('Your browser does not support WebGL')
    return false
  }

  let glContext = document.createElement('canvas').getContext('webgl')
  if (glContext === null) {
    glContext = document.createElement('canvas').getContext('experimental-webgl')
  }

  if (glContext === null) {
    console.log('Your browser does not support WebGL')
    return false
  }

  const gl = glContext.getSupportedExtensions()

  if (gl.indexOf('ANGLE_instanced_arrays') === -1) {
    console.log('ANGLE_instanced_arrays support is required to run this app')
    return false
  }

  return true
}

/**
 * Dynamically update a config setting
 *
 * @param {object} config
 */
const setConfig = async function (config) {
  if (!Component) {
    return
  }
  return Component.setConfig(config)
}

export {
  init,
  canRun,
  setConfig
}
