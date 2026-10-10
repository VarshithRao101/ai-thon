"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Landing hero (three.js): an automation graph whose data packets flow from
 * triggers through steps into a chain of hexagonal ledger blocks. Packets light
 * the nodes they pass; every arrival at the chain flashes the newest block.
 * Pauses off-screen, honours reduced motion, disposes everything on unmount.
 */

const GOLD = new THREE.Color("#ffc326");
const AMBER = new THREE.Color("#ff9f1c");
const COLUMNS = [3, 5, 6, 5, 3];
const PACKETS = 140;
const BLOCKS = 7;

type GraphNode = { pos: THREE.Vector3; col: number; out: number[] };
type GraphEdge = { curve: THREE.QuadraticBezierCurve3; to: number };
type Packet = { edge: number; t: number; speed: number };

function glowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.2, "rgba(255,214,102,0.9)");
    g.addColorStop(0.5, "rgba(255,170,30,0.25)");
    g.addColorStop(1, "rgba(255,160,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Deterministic pseudo-random so the layout is the same on every visit.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16_807) % 2_147_483_647;
    return (s - 1) / 2_147_483_646;
  };
}

function buildGraph() {
  const rand = rng(42);
  const nodes: GraphNode[] = [];
  const columns: number[][] = [];
  COLUMNS.forEach((count, col) => {
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const y = (i - (count - 1) / 2) * 1.05 + (rand() - 0.5) * 0.4;
      const z = (rand() - 0.5) * 2.4;
      const x = -6.2 + col * 2.35 + (rand() - 0.5) * 0.5;
      ids.push(nodes.length);
      nodes.push({ pos: new THREE.Vector3(x, y, z), col, out: [] });
    }
    columns.push(ids);
  });
  // The chain's entry point, where every path ends.
  const sink = nodes.length;
  nodes.push({
    pos: new THREE.Vector3(5.1, -0.2, 0),
    col: COLUMNS.length,
    out: [],
  });

  const edges: GraphEdge[] = [];
  const link = (from: number, to: number) => {
    const a = nodes[from].pos;
    const b = nodes[to].pos;
    const mid = a.clone().lerp(b, 0.5);
    mid.y += (rand() - 0.5) * 0.9;
    mid.z += (rand() - 0.5) * 0.9;
    nodes[from].out.push(edges.length);
    edges.push({ curve: new THREE.QuadraticBezierCurve3(a, mid, b), to });
  };
  for (let c = 0; c < columns.length; c++) {
    const next = columns[c + 1];
    for (const id of columns[c]) {
      if (!next) {
        link(id, sink);
        continue;
      }
      const fan = 1 + Math.floor(rand() * 2);
      const used = new Set<number>();
      for (let k = 0; k < fan; k++) {
        const target = next[Math.floor(rand() * next.length)];
        if (!used.has(target)) {
          used.add(target);
          link(id, target);
        }
      }
    }
  }
  // Make sure every node is reachable from the left.
  for (let c = 1; c < columns.length; c++) {
    for (const id of columns[c]) {
      const hasIn = edges.some((e) => e.to === id);
      if (!hasIn) {
        const prev = columns[c - 1];
        link(prev[Math.floor(rand() * prev.length)], id);
      }
    }
  }
  return { nodes, edges, sources: columns[0], sink };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one self-contained render loop with setup and teardown
export function HeroScene({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return; // No WebGL: the CSS backdrop still looks right.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.045);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const world = new THREE.Group();
    scene.add(world);

    const glow = glowTexture();
    const disposables: { dispose: () => void }[] = [glow];
    const track = <T extends { dispose: () => void }>(item: T) => {
      disposables.push(item);
      return item;
    };

    const { nodes, edges, sources, sink } = buildGraph();

    // Edges
    const edgeMaterial = track(
      new THREE.LineBasicMaterial({
        color: GOLD,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    for (const edge of edges) {
      const geometry = track(
        new THREE.BufferGeometry().setFromPoints(edge.curve.getPoints(40))
      );
      world.add(new THREE.Line(geometry, edgeMaterial));
    }

    // Nodes: a solid core plus a glow sprite that pulses when a packet passes.
    const coreGeometry = track(new THREE.IcosahedronGeometry(0.09, 1));
    const coreMaterial = track(new THREE.MeshBasicMaterial({ color: GOLD }));
    const pulses = new Float32Array(nodes.length);
    const halos: THREE.Sprite[] = [];
    nodes.forEach((node, i) => {
      if (i === sink) {
        halos.push(new THREE.Sprite());
        return;
      }
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      core.position.copy(node.pos);
      world.add(core);
      const halo = new THREE.Sprite(
        track(
          new THREE.SpriteMaterial({
            map: glow,
            color: node.col === 0 ? AMBER : GOLD,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        )
      );
      halo.position.copy(node.pos);
      halo.scale.setScalar(0.7);
      world.add(halo);
      halos.push(halo);
    });

    // Packets
    const packets: Packet[] = [];
    const packetPositions = new Float32Array(PACKETS * 3);
    const rand = rng(7);
    const startEdge = () => {
      const source = sources[Math.floor(rand() * sources.length)];
      const out = nodes[source].out;
      return out[Math.floor(rand() * out.length)];
    };
    for (let i = 0; i < PACKETS; i++) {
      packets.push({
        edge: startEdge(),
        t: rand(),
        speed: 0.18 + rand() * 0.28,
      });
    }
    const packetGeometry = track(new THREE.BufferGeometry());
    packetGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(packetPositions, 3)
    );
    const packetMaterial = track(
      new THREE.PointsMaterial({
        map: glow,
        color: 0xffe08a,
        size: 0.32,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    world.add(new THREE.Points(packetGeometry, packetMaterial));

    // Ledger: hexagonal blocks chained in a slow helix.
    const chain = new THREE.Group();
    chain.position.set(5.9, 0, 0);
    world.add(chain);
    const hexGeometry = track(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 6));
    const hexEdges = track(new THREE.EdgesGeometry(hexGeometry));
    const blocks: {
      group: THREE.Group;
      line: THREE.LineBasicMaterial;
      face: THREE.MeshBasicMaterial;
    }[] = [];
    for (let i = 0; i < BLOCKS; i++) {
      const group = new THREE.Group();
      const face = track(
        new THREE.MeshBasicMaterial({
          color: 0x1a1406,
          transparent: true,
          opacity: 0.85,
        })
      );
      const line = track(
        new THREE.LineBasicMaterial({
          color: GOLD,
          transparent: true,
          opacity: 0.75,
        })
      );
      group.add(new THREE.Mesh(hexGeometry, face));
      group.add(new THREE.LineSegments(hexEdges, line));
      group.position.set(
        Math.sin(i * 0.9) * 0.35,
        (i - (BLOCKS - 1) / 2) * 0.62,
        Math.cos(i * 0.9) * 0.35
      );
      group.rotation.x = Math.PI / 2;
      group.rotation.z = i * 0.35;
      chain.add(group);
      blocks.push({ group, line, face });
    }
    const linkMaterial = track(
      new THREE.LineBasicMaterial({
        color: GOLD,
        transparent: true,
        opacity: 0.35,
      })
    );
    const linkGeometry = track(
      new THREE.BufferGeometry().setFromPoints(
        blocks.map((b) => b.group.position.clone())
      )
    );
    chain.add(new THREE.Line(linkGeometry, linkMaterial));
    let flash = 0;
    let flashBlock = BLOCKS - 1;

    // Dust
    const dustCount = 1400;
    const dust = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = 9 + rand() * 18;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      dust[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      dust[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      dust[i * 3 + 2] = r * Math.cos(phi) - 6;
    }
    const dustGeometry = track(new THREE.BufferGeometry());
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dust, 3));
    const dustPoints = new THREE.Points(
      dustGeometry,
      track(
        new THREE.PointsMaterial({
          color: 0xc9a54a,
          size: 0.045,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        })
      )
    );
    scene.add(dustPoints);

    // Layout and input
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(h, 1);
      const narrow = w < 768;
      camera.position.set(0, narrow ? -1.2 : 0.2, narrow ? 21 : 13.5);
      // Desktop: the graph sits right of the headline; phones: below it.
      world.position.set(narrow ? 0 : 2.5, narrow ? -2.6 : -0.2, 0);
      world.scale.setScalar(narrow ? 0.8 : 0.84);
      camera.updateProjectionMatrix();
    };
    const onPointer = (event: PointerEvent) => {
      pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    window.addEventListener("pointermove", onPointer, { passive: true });

    // Loop
    const timer = new THREE.Timer();
    const point = new THREE.Vector3();
    let frame = 0;
    let visible = true;
    const step = () => {
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.05);
      const time = timer.getElapsed();

      for (let i = 0; i < packets.length; i++) {
        const p = packets[i];
        p.t += dt * p.speed;
        if (p.t >= 1) {
          const arrived = edges[p.edge].to;
          pulses[arrived] = 1;
          const out = nodes[arrived].out;
          if (arrived === sink || out.length === 0) {
            flash = 1;
            flashBlock = (flashBlock + 1) % BLOCKS;
            p.edge = startEdge();
          } else {
            p.edge = out[Math.floor(rand() * out.length)];
          }
          p.t = 0;
        }
        edges[p.edge].curve.getPoint(p.t, point);
        packetPositions[i * 3] = point.x;
        packetPositions[i * 3 + 1] = point.y;
        packetPositions[i * 3 + 2] = point.z;
      }
      packetGeometry.attributes.position.needsUpdate = true;

      for (let i = 0; i < halos.length; i++) {
        if (i === sink) {
          continue;
        }
        pulses[i] = Math.max(0, pulses[i] - dt * 2.2);
        const breathe = 0.62 + Math.sin(time * 1.6 + i) * 0.06;
        halos[i].scale.setScalar(breathe + pulses[i] * 0.9);
        (halos[i].material as THREE.SpriteMaterial).opacity =
          0.4 + pulses[i] * 0.6;
      }

      flash = Math.max(0, flash - dt * 1.4);
      blocks.forEach((block, i) => {
        block.group.rotation.z += dt * (0.25 + i * 0.03);
        const lit = i === flashBlock ? flash : 0;
        block.line.opacity = 0.55 + lit * 0.45;
        block.face.color.setRGB(0.1 + lit * 0.6, 0.08 + lit * 0.42, 0.02);
      });
      chain.rotation.y = Math.sin(time * 0.3) * 0.25;

      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      world.rotation.y = -0.32 + pointer.x * 0.16 + Math.sin(time * 0.15) * 0.05;
      world.rotation.x = 0.08 + pointer.y * 0.08;
      dustPoints.rotation.y = time * 0.012;

      renderer.render(scene, camera);
    };
    const loop = () => {
      if (!visible) {
        frame = 0;
        return;
      }
      step();
      frame = requestAnimationFrame(loop);
    };
    const visibility = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible && !reduced && frame === 0) {
        timer.update();
        frame = requestAnimationFrame(loop);
      }
    });
    visibility.observe(mount);
    if (reduced) {
      step();
    } else {
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      visibility.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
      for (const item of disposables) {
        item.dispose();
      }
      timer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div aria-hidden className={className} ref={mountRef} />;
}
