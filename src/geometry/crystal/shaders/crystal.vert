#pragma glslify: noise = require('glsl-noise/simplex/4d');
#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')
#pragma glslify: rotationMatrix = require('../../../shaders/rotationMatrix')
#pragma glslify: random = require('../../../shaders/random)

#define PHYSICAL

uniform float uTime;
uniform float uAudioTime;
uniform float uFirstLoop;

uniform vec2 uOriginOffset;

attribute float isHovered;
attribute float isSelected;
attribute vec3 pickerColor;
attribute vec3 offset;
attribute float scale;
attribute float spentRatio;
attribute vec3 barycentric;
attribute float topVertex;
attribute float txValue;
attribute vec4 quaternion;
attribute float txTime;
attribute float blockStartTime;

varying float vIsHovered;
varying float vIsSelected;
varying vec3 vViewPosition;
varying vec3 vTransformed;
varying float vScale;
varying float vSpentRatio;
varying vec3 vBarycentric;
varying float vTopVertex;
varying float vBottomVertex;
varying float vEnvelope;
varying vec3 vPickerColor;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	vPickerColor = pickerColor;

	vIsHovered = isHovered;
	vIsSelected = isSelected;

	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>

	#include <beginnormal_vertex>
	
	#include <defaultnormal_vertex>

#ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED

	vNormal = normalize( transformedNormal );

#endif

	#include <begin_vertex>

	float offsetTime = uAudioTime - blockStartTime;

	// envelope
	float attack = smoothstep(txTime, txTime + 5.0, offsetTime * 0.001);
	float release = (1.0 - smoothstep(txTime + 5.0, txTime + 10.0, offsetTime * 0.001));

	float blockActive = (blockStartTime == 0.0) ? 0.0 : 1.0;

	vEnvelope = (attack * release) * blockActive;


	transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );
	vec3 originalTransform = transformed.xyz;


	//float scaledTime = (timeMod * 0.002);

	if (uFirstLoop == 1.0) {
	  	transformed.xz *= (scale * attack);
		transformed.y *= (offset.y * attack);
	} else {
		transformed.xz *= scale;
		transformed.y *= offset.y;
	}

		transformed.y += offset.y * 0.5;

		transformed.y += (1.0 * isSelected);

		transformed.y += abs(sin( (uTime*0.0005) )) * 5.0 * isSelected;
		mat4 rotation = rotationMatrix(offset.xyz * vec3(0.0,1.0,0.0), (uTime*0.0002) * isSelected);
		// transformed.y += abs(sin( ((uTime+(txTime*1000.0))*0.0005) )) * 2.5 ;
		// mat4 rotation = rotationMatrix(offset.xyz * vec3(0.0,1.0,0.0), ((uTime+(txTime*1000.0))*0.0002) );

		vec4 newPos = rotation * vec4( transformed, 1.0 );

		transformed.xyz = newPos.xyz;
		
	//if (timeMod < 500.0) {
    	//transformed.xz *= (scale * scaledTime);
//	} else {
  //  	transformed.xz *= scale;
//	}

	
	// if (timeMod < 500.0 && offset.y > 0.0) {
    // 	transformed.y *= (scaledTime * offset.y);
	// 	transformed.y += (scaledTime * offset.y) * 0.5;
	// } else {
    // 	transformed.y *= offset.y;

	// }

    //transformed.y *= offset.y;
    transformed.xz += (offset.xz - uOriginOffset.xy);

	//transformed.x += (random(originalTransform.x) * (scale * 0.4) - (scale * 0.2)) * centerTopVertex;
	//transformed.z += (random(originalTransform.y) * (scale * 0.4) - (scale * 0.2)) * centerTopVertex;

	// transformed.y += (random(offset.z) * (offset.y * 0.02) - (offset.y * 0.01)) * topVertex * (1.0 - centerTopVertex);
	// transformed.y += (offset.y * 0.02) * centerTopVertex;

	//transformed.y -= (offset.y * 0.03) * centerBottomVertex;

	// transformed.y -= 4.5 * centerBottomVertex;

	vTransformed = transformed;
	vTopVertex = topVertex;
	vBottomVertex = 1.0 - topVertex;
	//vCenterBottomVertex = centerBottomVertex;

	vScale = scale;

	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>

	vViewPosition = - mvPosition.xyz;

	vSpentRatio = spentRatio;

	vBarycentric = barycentric;

	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
