import * as THREE from "three";
import { rotationGroupingsMap180 } from "./rotationGroupingsMap180.js";
import { rotationGroupings } from "./rotationGroupings.js";
import { remove } from "three/examples/jsm/libs/tween.module.js";
// === rotationutil.js ===

import {
  getShouldReverseMidway,
  setShouldReverseMidway,
  incrementReverseCounter,
} from "./main.js"; // ✅ 路径按你实际情况调整

// Axis of rotation per face
const faceAxes = {
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
};

// Group IDs per face (for visual rotation)
const faceGroups = {
  top: [5, 6, 7, 8],
  bottom: [1, 2, 3, 4],
  left: [1, 3, 5, 7],
  right: [2, 4, 6, 8],
  front: [3, 4, 7, 8],
  back: [1, 2, 5, 6],
};

export function getGroupOriginalCenter(num) {
  let x = 0,
    y = 0,
    z = 0;

  if (faceGroups.left.includes(num)) x = -7.5;
  else if (faceGroups.right.includes(num)) x = 7.5;
  else x = 0;

  if (faceGroups.top.includes(num)) y = 7.5;
  else if (faceGroups.bottom.includes(num)) y = -7.5;
  else y = 0;

  if (faceGroups.front.includes(num)) z = 7.5;
  else if (faceGroups.back.includes(num)) z = -7.5;
  else z = 0;

  return new THREE.Vector3(x, y, z);
}

let steps = 65;

export function setStep(val) {
  steps = val;
}

export function rotate180(
  face,
  groupArray,
  groupDirectionArray,
  getGroupCenter,
  sceneCenter,
  onComplete
) {
  const axis = faceAxes[face];
  let totalAngle = Math.PI;
  const groupIDs = faceGroups[face];

  let accumulatedAngle = 0;
  let currentDelta = 0;

  function animate() {
    const remaining = totalAngle - accumulatedAngle;
    if (remaining <= 1e-5) {
      if (getShouldReverseMidway() == false) {
        console.log("here");
        applyRotationGroupMapping(face);
        incrementReverseCounter();
        totalAngle += Math.PI;
      } else {
        applyRotationGroupMapping(face);
        setShouldReverseMidway(false);
        if (onComplete) onComplete();
        return;
      }
    }

    const targetDelta = Math.PI / steps;
    currentDelta = THREE.MathUtils.lerp(currentDelta, targetDelta, 0.2);
    const appliedDelta = Math.min(currentDelta, remaining);

    for (const id of groupIDs) {
      const group = groupArray[id];
      group.rotateOnWorldAxis(axis, appliedDelta);

      const newCenter = getGroupCenter(group);
      const newDir = newCenter.clone().sub(sceneCenter).normalize();
      groupDirectionArray[id] = newDir;
    }

    accumulatedAngle += appliedDelta;
    requestAnimationFrame(animate);
  }

  animate();
}

function arraysEqualIgnoreOrder(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;

  const sorted1 = [...arr1].slice().sort();
  const sorted2 = [...arr2].slice().sort();

  return sorted1.every((val, index) => val === sorted2[index]);
}

function removeValue(array, value) {
  const index = array.indexOf(value);
  if (index !== -1) {
    array.splice(index, 1);
  }
}

function addUnique(array, value) {
  if (!array.includes(value)) {
    array.push(value);
  }
}

function applyRotationGroupMapping(face) {
  for (let i = 1; i <= 8; i++) {
    const currentFaces = rotationGroupings[i]; // 🛠️ Store before mutating

    for (let j = 0; j < rotationGroupingsMap180.length; j++) {
      const mapping = rotationGroupingsMap180[j];

      if (
        mapping.rotation === face &&
        arraysEqualIgnoreOrder(mapping.cube, currentFaces)
      ) {
        // First remove old i from all faceGroups that referenced it
        for (let k = 0; k < 3; k++) {
          removeValue(faceGroups[currentFaces[k]], i);
        }

        // Add new face references
        for (let k = 0; k < 3; k++) {
          addUnique(faceGroups[mapping.new[k]], i);
        }

        // Replace the face group mapping for this cube
        rotationGroupings[i] = mapping.new.slice();

        break; // ✅ Stop after finding the match
      }
    }
  }
}

function applyRotationGroupMappingReverse(face) {
  for (let i = 1; i <= 8; i++) {
    const currentFaces = rotationGroupings[i];

    for (const mapping of rotationGroupingsMap180) {
      if (
        mapping.rotation === face &&
        arraysEqualIgnoreOrder(mapping.new, currentFaces) // ⬅️ 注意顺序反了
      ) {
        for (let k = 0; k < 3; k++) {
          removeValue(faceGroups[currentFaces[k]], i);
        }
        for (let k = 0; k < 3; k++) {
          addUnique(faceGroups[mapping.cube[k]], i);
        }

        rotationGroupings[i] = mapping.cube.slice(); // ⬅️ 设置为原始 cube 面
        break;
      }
    }
  }
}
