import * as THREE from 'three'

import Detector from './libs/Detector'

const detector = new Detector()

const Config = {
  scene: {
    fullScreen: true,
    width: 300,
    height: 300,
    antialias: window.devicePixelRatio === 1,
    canvasID: 'symphony-stage', // ID of wegbl canvas element
    autoRotate: false, // auto rotate camera around target
    autoRotateSpeed: 0.1, // speed of auto rotation
    bgColor: 0x121327,
    fogDensity: 0.00001
    // fogDensity: 0.0000000000005
  },
  blockchainInfo: {
    apiCode: '0a52b97c-0d8e-4033-a87d-abfda8bfe940'
  },
  fireBase: {
    apiKey: 'AIzaSyCwfdzrjQ5GRqyz-napBM29T7Zel_6KIUY',
    // authDomain: 'webgl-gource-1da99.firebaseapp.com',
    databaseURL: 'https://webgl-gource-1da99.firebaseio.com',
    projectId: 'webgl-gource-1da99',
    storageBucket: 'webgl-gource-1da99.appspot.com',
    messagingSenderId: '532264380396'
  },
  camera: {
    fov: 50,
    initPos: {x: 0, y: 0, z: -200}
  },
  floatType: detector.isIOS ? THREE.HalfFloatType : THREE.FloatType
}

export default Config
