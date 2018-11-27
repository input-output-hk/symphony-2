//#pragma glslify: noise = require('glsl-noise/simplex/4d');
#pragma glslify: curlNoise = require('./curlNoise');

varying vec2 vUv;

uniform vec2 uOriginOffset;
uniform float uTime;

uniform sampler2D positionTexture;

void main() {
  vec4 currentPosition = texture2D(positionTexture, vUv);

  //float noiseVec = noise(vec4(currentPosition.xyz * 0.1, uTime * 0.001));
  //float noiseVec = noise(vec4(currentPosition.xyz * 0.1, 0.0));

 // currentPosition += noiseVec;

  vec3 newPosition = currentPosition.xyz + curlNoise(currentPosition.xyz * 0.01) * 1.0;

  currentPosition.xyz = mix(currentPosition.xyz, newPosition, 0.5);


  //vec3 newPos = vec3(0.);

  //newPos = currentPosition.xyz + 100.0;

  //vec3 finalPos = mix(currentPosition.xyz, newPos, 0.5);

  // currentPosition.xz -= uOriginOffset;

 currentPosition.xz -= normalize(uOriginOffset - currentPosition.xz) * 2.0;

  gl_FragColor = vec4(currentPosition.xyz, 1.);

}