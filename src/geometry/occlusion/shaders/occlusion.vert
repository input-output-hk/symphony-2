#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')

attribute vec2 planeOffset;
attribute vec4 quaternion;

uniform vec2 uOriginOffset;

#include <logdepthbuf_pars_vertex>

void main() {

	#include <begin_vertex>

	transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );
    transformed.xz += (planeOffset.xy - uOriginOffset);

	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>

}