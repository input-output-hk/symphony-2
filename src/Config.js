import * as THREE from 'three'

import Detector from './libs/Detector'

const detector = new Detector()

const Config = {
  scene: {
    showIntro: true,
    introTextTime: 5500, // ms
    fullScreen: true,
    width: 300,
    height: 300,
    antialias: window.devicePixelRatio === 1,
    canvasID: 'symphony-stage', // ID of webgl canvas element
    autoRotate: false, // auto rotate camera around target
    autoRotateSpeed: 0.1, // speed of auto rotation
    bgColor: 0x121327,
    fogDensity: 0.00025,
    particleLifeMin: 100, // min number of frames a particle can live for
    particleLifeMax: 1000, // max number of frames a particle can live for
    particleEmitterRadius: 200000, // size of sphere which emits particles
    // forceMaxHeight: 566610
    forceMaxHeight: null, // if blockchain.info API is playing up, get data directly from firebase
    liveUnconfirmedTX: false
  },
  debug: {
    debugPicker: false,
    showGUI: false
  },
  audio: {
    sampleRate: 22050,
    soundDuration: 30, // (seconds)
    noteDuration: 10, // (seconds)
    maxSineBankLoops: 1000
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
    fov: 80,
    initPos: new THREE.Vector3(0.0, 1300000.0, 0.0),
    initTarget: new THREE.Vector3(0.0, 0.0, 0.0)
  },
  VR: {
    interactionTimeout: 0 // (ms)
  },
  floatType: detector.isIOS ? THREE.HalfFloatType : THREE.FloatType
}

export default Config
