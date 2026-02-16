import * as THREE from './lib/three.module.min.js';

let scene, camera, renderer, clock;
const keys = {};
const buildings = [];
let gate, gateArrow;
let score = 0;

// Physics Constants - Tuned for "Heavy" Drone Feel
const GRAVITY = 15.0;      // Stronger gravity for less float
const THRUST_MAX = 42.0;   // High power but needs management
const DRAG = 0.04;         // More air resistance for stability
const ANGULAR_RATE = 4.5; 
const ALT_HOLD_STRENGTH = 8.0; // Subtle lift near neutral throttle

const drone = {
    position: new THREE.Vector3(0, 10, 50),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    throttle: 0.35, // Starting throttle near hover point
    width: 0.6
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);
    scene.fog = new THREE.Fog(0x88ccff, 5, 250);
    
    camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    clock = new THREE.Clock();

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(50, 100, 50);
    scene.add(sun);

    // --- Ground with Tiled Texture ---
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 128;
    groundCanvas.height = 128;
    const gCtx = groundCanvas.getContext('2d');
    gCtx.fillStyle = '#222';
    gCtx.fillRect(0,0,128,128);
    gCtx.strokeStyle = '#444';
    gCtx.lineWidth = 4;
    gCtx.strokeRect(0,0,128,128);
    
    const groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(100, 100);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshPhongMaterial({ map: groundTex })).rotateX(-Math.PI/2));

    // --- Building Texture ---
    const buildCanvas = document.createElement('canvas');
    buildCanvas.width = 64; buildCanvas.height = 64;
    const bCtx = buildCanvas.getContext('2d');
    bCtx.fillStyle = '#555'; bCtx.fillRect(0,0,64,64);
    bCtx.strokeStyle = '#333'; bCtx.strokeRect(5,5,20,20); bCtx.strokeRect(35,5,20,20); // Windows
    const buildTex = new THREE.CanvasTexture(buildCanvas);
    buildTex.wrapS = buildTex.wrapT = THREE.RepeatWrapping;

    // --- Generate City ---
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 60; i++) {
        const h = 10 + Math.random() * 30;
        const w = 10 + Math.random() * 10;
        const building = new THREE.Mesh(boxGeo, new THREE.MeshPhongMaterial({ map: buildTex }));
        building.scale.set(w, h, w);
        building.position.set((Math.random()-0.5)*400, h/2, (Math.random()-0.5)*400);
        buildings.push(building);
        scene.add(building);
    }

    // --- Racing Gate (The Goal) ---
    const gateGeo = new THREE.TorusGeometry(4, 0.4, 8, 24);
    const gateMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0x330000 });
    gate = new THREE.Mesh(gateGeo, gateMat);
    spawnGate();
    scene.add(gate);

    // Directional Arrow to Gate
    const arrowGeo = new THREE.ConeGeometry(0.2, 0.5, 8);
    gateArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    gateArrow.rotation.x = Math.PI / 2;
    camera.add(gateArrow);
    gateArrow.position.set(0, 0.5, -2);
    scene.add(camera);

    // FPV Rod
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6), new THREE.MeshBasicMaterial({ color: 0x000 }));
    rod.rotation.x = Math.PI/2.2; rod.position.set(0, -0.4, -0.4);
    camera.add(rod);

    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);
    animate();
}

function spawnGate() {
    gate.position.set((Math.random()-0.5)*200, 5 + Math.random()*15, (Math.random()-0.5)*200);
    gate.lookAt(0, gate.position.y, 0); // Face generally toward center
}

function updatePhysics(dt) {
    // Controls
    if (keys['KeyW']) drone.rotation.x -= ANGULAR_RATE * dt;
    if (keys['KeyS']) drone.rotation.x += ANGULAR_RATE * dt;
    if (keys['KeyA']) drone.rotation.z += ANGULAR_RATE * dt;
    if (keys['KeyD']) drone.rotation.z -= ANGULAR_RATE * dt;
    if (keys['ArrowLeft']) drone.rotation.y += ANGULAR_RATE * dt;
    if (keys['ArrowRight']) drone.rotation.y -= ANGULAR_RATE * dt;

    if (keys['ArrowUp']) drone.throttle = Math.min(drone.throttle + 1.5 * dt, 1.0);
    else if (keys['ArrowDown']) drone.throttle = Math.max(drone.throttle - 1.5 * dt, 0.0);

    // Forces
    const up = new THREE.Vector3(0, 1, 0).applyEuler(drone.rotation);
    const thrustForce = up.multiplyScalar(drone.throttle * THRUST_MAX);
    
    // Altitude Hold Assist (simulates flight controller stabilization)
    const hoverPoint = 0.38; 
    if (Math.abs(drone.throttle - hoverPoint) < 0.1 && drone.velocity.y < 0) {
        thrustForce.y += ALT_HOLD_STRENGTH * dt;
    }

    const netForce = thrustForce.add(new THREE.Vector3(0, -GRAVITY, 0));
    drone.velocity.add(netForce.multiplyScalar(dt));
    drone.velocity.multiplyScalar(1 - DRAG);
    drone.position.add(drone.velocity.clone().multiplyScalar(dt));

    // Collision & Goal Check
    if (drone.position.y < 0.2) resetDrone();
    const droneBox = new THREE.Box3().setFromCenterAndSize(drone.position, new THREE.Vector3(0.5,0.5,0.5));
    buildings.forEach(b => { if (droneBox.intersectsBox(new THREE.Box3().setFromObject(b))) resetDrone(); });

    // Gate Check
    if (drone.position.distanceTo(gate.position) < 4) {
        score++;
        spawnGate();
    }

    // Update Visuals
    camera.position.copy(drone.position);
    camera.quaternion.setFromEuler(drone.rotation);
    gateArrow.lookAt(gate.position);
    
    document.getElementById('alt').innerText = `${drone.position.y.toFixed(1)}m | GATES: ${score}`;
    document.getElementById('spd').innerText = `${(drone.velocity.length() * 3.6).toFixed(0)}km/h`;
    if (keys['KeyR']) resetDrone();
}

function resetDrone() {
    drone.position.set(0, 10, 50);
    drone.velocity.set(0, 0, 0);
    drone.rotation.set(0, 0, 0);
    drone.throttle = 0.35;
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics(clock.getDelta());
    renderer.render(scene, camera);
}

init();