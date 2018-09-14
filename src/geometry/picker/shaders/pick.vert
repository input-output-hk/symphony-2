#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')

attribute vec3 pickerColor;
attribute vec3 offset;
attribute vec2 planeOffset;
attribute float scale;
attribute vec4 quaternion;

varying vec3 vPickerColor;

#include <logdepthbuf_pars_vertex>

void main() {

	vPickerColor = pickerColor;

	#include <begin_vertex>

	transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );
	vec3 originalTransform = transformed.xyz;

	transformed.xz *= (scale);
	transformed.y *= (offset.y);
	transformed.y += offset.y * 0.5;
    transformed.xz += offset.xz;

	#include <project_vertex>

}
