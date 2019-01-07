#pragma glslify: curlNoise = require('./curlNoise');

varying vec2 vUv;

uniform vec2 uOriginOffset;
uniform vec3 uSpawnStart;
// uniform vec3 uSpawnDestination;
uniform float uTime;
uniform float uDeltaTime;
uniform float uFrame;

uniform sampler2D positionTexture;
uniform sampler2D defaultPositionTexture;

float rand(float n){return fract(sin(n) * 43758.5453123);}

void main() {
  vec4 defaultPosition = texture2D(defaultPositionTexture, vUv);
  vec4 currentPosition = texture2D(positionTexture, vUv);
  vec4 previousPosition = currentPosition;

  vec3 toCenter = normalize(vec3(0.0, 0.0, 0.0) - previousPosition.xyz);
  //currentPosition.xyz += toCenter * 2.0;

  currentPosition.xyz = currentPosition.xyz + curlNoise(currentPosition.xyz * 0.0000025) * 200.8;

  // decrement life value, reset to default at 0
  currentPosition.w -= (1.0 - uDeltaTime);
  if (currentPosition.w < 0.0 ) {
    currentPosition = defaultPosition;
    currentPosition.xyz += uSpawnStart;
  }

  gl_FragColor = currentPosition;

}