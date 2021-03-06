export default class Detector {
  constructor () {
    this.prefixes = 'Webkit Moz O ms'.split(' ')
    this.ua = (navigator.userAgent || navigator.vendor || window.opera).toLowerCase()
    this.isRetina = window.devicePixelRatio && window.devicePixelRatio >= 1.5
    this.isChrome = this.ua.indexOf('chrome') > -1
    this.isFirefox = this.ua.indexOf('firefox') > -1
    this.isSafari = this.ua.indexOf('safari') > -1
    this.isEdge = this.ua.indexOf('edge') > -1
    this.isIE = this.ua.indexOf('msie') > -1
    this.isMobile = /(iPad|iPhone|Android)/i.test(this.ua)
    this.isIOS = /(iPad|iPhone)/i.test(this.ua)
  }
}
