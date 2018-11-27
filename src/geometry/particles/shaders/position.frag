#pragma glslify: curlNoise = require('./curlNoise');

varying vec2 vUv;

uniform vec2 uOriginOffset;
uniform float uTime;

uniform sampler2D positionTexture;
uniform sampler2D defaultPositionTexture;

void main() {
  vec4 defaultPosition = texture2D(defaultPositionTexture, vUv);
  vec4 currentPosition = texture2D(positionTexture, vUv);

  vec3 newPosition = currentPosition.xyz + curlNoise(currentPosition.xyz * 0.02) * 1.0;

  currentPosition.w--;

  currentPosition.xyz = mix(currentPosition.xyz, newPosition, 0.5);

  vec2 toCenter = normalize(uOriginOffset - currentPosition.xz);

  defaultPosition.xz -= toCenter * (uTime * 0.3);

  if (currentPosition.w <= 0.0) {
    currentPosition = defaultPosition;
  }

  gl_FragColor = currentPosition;

}