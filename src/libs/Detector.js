export default class Detector {
  constructor () {
    this.prefixes = 'Webkit Moz O ms'.split(' ')
    this.dummyStyle = document.createElement('div').style
    this.win = window
    this.doc = document
    this.ua = (navigator.userAgent || navigator.vendor || window.opera).toLowerCase()
    this.isRetina = this.win.devicePixelRatio && this.win.devicePixelRatio >= 1.5
    this.isSupportOpacity = typeof this.dummyStyle.opacity !== 'undefined'
    this.isChrome = this.ua.indexOf('chrome') > -1
    this.isFirefox = this.ua.indexOf('firefox') > -1
    this.isSafari = this.ua.indexOf('safari') > -1
    this.isEdge = this.ua.indexOf('edge') > -1
    this.isIE = this.ua.indexOf('msie') > -1
    this.isMobile = /(iPad|iPhone|Android)/i.test(this.ua)
    this.isIOS = /(iPad|iPhone)/i.test(this.ua)
  }
}
