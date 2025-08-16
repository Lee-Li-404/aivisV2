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

// === 你的 pair-based CCW 规则（以该面朝你、逆时针） ===
const pairMapCCW = {
  top: {
    "left,front": ["right", "front"],
    "left,back": ["left", "front"],
    "right,front": ["right", "back"],
    "right,back": ["left", "back"],
  },
  right: {
    "top,front": ["bottom", "front"],
    "top,back": ["top", "front"],
    "bottom,front": ["bottom", "back"],
    "bottom,back": ["top", "back"],
  },
  bottom: {
    "left,front": ["left", "back"],
    "left,back": ["right", "back"],
    "right,front": ["left", "front"],
    "right,back": ["right", "front"],
  },
  left: {
    "top,front": ["top", "back"],
    "top,back": ["bottom", "back"],
    "bottom,front": ["top", "front"],
    "bottom,back": ["bottom", "front"],
  },
  front: {
    "top,left": ["bottom", "left"],
    "top,right": ["top", "left"],
    "bottom,left": ["bottom", "right"],
    "bottom,right": ["top", "right"],
  },
  back: {
    "top,left": ["top", "right"],
    "top,right": ["bottom", "right"],
    "bottom,left": ["top", "left"],
    "bottom,right": ["bottom", "left"],
  },
};

function canonicalPairOrder(face, a, b) {
  const axisOrder = {
    top: { g1: new Set(["left", "right"]), g2: new Set(["front", "back"]) },
    bottom: { g1: new Set(["left", "right"]), g2: new Set(["front", "back"]) },
    left: { g1: new Set(["top", "bottom"]), g2: new Set(["front", "back"]) },
    right: { g1: new Set(["top", "bottom"]), g2: new Set(["front", "back"]) },
    front: { g1: new Set(["top", "bottom"]), g2: new Set(["left", "right"]) },
    back: { g1: new Set(["top", "bottom"]), g2: new Set(["left", "right"]) },
  };
  const { g1, g2 } = axisOrder[face];
  if (g1.has(a) && g2.has(b)) return [a, b];
  if (g1.has(b) && g2.has(a)) return [b, a];
  return [a, b]; // fallback
}

// 用成对规则把“该面标签以外的两项”做 CCW 置换；该面标签保持不变
function permuteFacesCCW_byPairs(faces, face) {
  const others = faces.filter((f) => f !== face);
  if (others.length !== 2) return faces.slice();
  const [p, q] = canonicalPairOrder(face, others[0], others[1]);
  const key = `${p},${q}`;
  const mapped = (pairMapCCW[face] || {})[key];
  if (!mapped) return faces.slice();
  return [face, mapped[0], mapped[1]];
}

// === 生成“当前状态下”的 90°（CCW）查表，风格与你的 180° 表一致 ===
function buildRotationGroupingsMap90CCW(face) {
  const map = [];
  const ids = faceGroups[face]; // 该面的四个角块（当前状态）
  for (const id of ids) {
    const cube = rotationGroupings[id]; // 旧朝向
    const next = permuteFacesCCW_byPairs(cube, face); // 新朝向
    map.push({ rotation: face, id, cube: cube.slice(), new: next.slice() });
  }
  return map;
}

// === 按“查表→删旧→加新→写回”的方式应用 90°（CCW） ===
export function applyRotationGroupMapping90(face) {
  const rotationGroupingsMap90 = buildRotationGroupingsMap90CCW(face);

  for (let i = 1; i <= 8; i++) {
    const currentFaces = rotationGroupings[i];

    for (let j = 0; j < rotationGroupingsMap90.length; j++) {
      const mapping = rotationGroupingsMap90[j];

      if (
        mapping.rotation === face &&
        arraysEqualIgnoreOrder(mapping.cube, currentFaces)
      ) {
        // 1) 从旧面组移除
        for (let k = 0; k < 3; k++) {
          removeValue(faceGroups[currentFaces[k]], i);
        }
        // 2) 加入新面组
        for (let k = 0; k < 3; k++) {
          addUnique(faceGroups[mapping.new[k]], i);
        }
        // 3) 写回当前方块的朝向
        rotationGroupings[i] = mapping.new.slice();
        break; // 找到匹配就结束内层循环
      }
    }
  }
}

let steps = 65;

export function setStep(val) {
  steps = val;
}

export function rotate90(
  face,
  groupArray,
  groupDirectionArray,
  getGroupCenter,
  sceneCenter,
  onComplete
) {
  const axis = faceAxes[face];
  let totalAngle = Math.PI / 2; // 90°
  const groupIDs = faceGroups[face];

  let accumulatedAngle = 0;
  let currentDelta = 0;

  function animate() {
    const remaining = totalAngle - accumulatedAngle;

    if (remaining <= 1e-5) {
      if (getShouldReverseMidway() == false) {
        // ✅ 用 90° 的 CCW 查表映射更新状态
        applyRotationGroupMapping90(face);
        incrementReverseCounter();
        totalAngle += Math.PI / 2; // 如果还要连续旋转
      } else {
        applyRotationGroupMapping90(face);
        setShouldReverseMidway(false);
        if (onComplete) onComplete();
        return;
      }
    }

    // 90° 分成 steps 步完成
    const targetDelta = Math.PI / steps;
    currentDelta = THREE.MathUtils.lerp(currentDelta, targetDelta, 0.2);
    const appliedDelta = Math.min(currentDelta, remaining);

    // 几何动画部分保持原样
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
