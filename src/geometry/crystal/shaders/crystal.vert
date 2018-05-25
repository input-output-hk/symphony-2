#define PHYSICAL

attribute vec4 offset;
attribute float scale;
attribute float txValue;
attribute float id;

varying vec3 vViewPosition;

#include <common>

void main() {

	#include <beginnormal_vertex>
	#include <begin_vertex>

    transformed.xy *= scale;

	//float height = log( (txValue) );
	float height = txValue * 0.0000001;

    transformed.z *= height;
    transformed.z += height * 0.5;

    transformed.xyz += offset.xyz;

	#include <project_vertex>

	vViewPosition = - mvPosition.xyz;

	gl_Position = projectionMatrix * mvPosition;

}
