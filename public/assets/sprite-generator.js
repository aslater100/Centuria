/**
 * Colony Sim Sprite Generator
 * Procedural pixel-art sprites inspired by RimWorld
 * 
 * Generates:
 * - Terrain tiles (grass, dirt, sand, water, stone)
 * - Plants (grains, trees, shrubs, wild plants)
 * - Animals (livestock, wild creatures, insects)
 * - NPCs (settlers with varied features)
 * - Structures (buildings, walls, fences)
 * - Items (resources, tools, food, weapons)
 * - Weather effects (rain, snow, dust, smoke)
 */

class SpriteGenerator {
  constructor() {
    this.palette = {
      // Terrain
      grass_light: '#7a8c54',
      grass_dark: '#566445',
      soil: '#6b5138',
      sand: '#c9b584',
      stone: '#787469',
      water_light: '#4a7a9b',
      water_dark: '#2d4a6b',
      
      // Vegetation
      leaf_dark: '#3d5a2f',
      leaf_light: '#5a7d47',
      bark: '#6b5138',
      grain: '#c2a14d',
      
      // Animals
      fur_brown: '#8b6f47',
      fur_gray: '#7a7a7a',
      fur_light: '#a89968',
      flesh: '#c9956a',
      
      // NPCs
      skin: '#d4a574',
      hair_dark: '#4a3a2c',
      hair_light: '#8b7355',
      clothing_brown: '#6b5138',
      clothing_blue: '#3d586b',
      clothing_red: '#8b4a3a',
      
      // Structure
      wood: '#9c7544',
      stone_dark: '#6b5f52',
      
      // Effects
      white: '#ffffff',
      black: '#26201a',
    };
  }

  /**
   * Create a canvas and get 2D context
   */
  createCanvas(width, height) {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas) {
      throw new Error('Canvas not available in this environment');
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  }

  /**
   * Terrain: Grass tile with variation
   */
  grassTile(variant = 0) {
    const { canvas, ctx } = this.createCanvas(32, 32);
    const seed = variant % 3;
    
    // Base
    ctx.fillStyle = this.palette.grass_light;
    ctx.fillRect(0, 0, 32, 32);
    
    // Darker patches (noise)
    ctx.fillStyle = this.palette.grass_dark;
    if (seed === 0) {
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillRect(16, 16, 16, 16);
    } else if (seed === 1) {
      ctx.fillRect(8, 8, 16, 16);
    } else {
      ctx.fillRect(0, 16, 32, 8);
    }
    
    // Grass tufts
    ctx.fillStyle = '#5a7d47';
    ctx.fillRect(4, 28, 2, 4);
    ctx.fillRect(12, 26, 3, 6);
    ctx.fillRect(20, 27, 2, 5);
    ctx.fillRect(28, 25, 2, 7);
    
    return canvas;
  }

  /**
   * Terrain: Tilled soil/farmland
   */
  soilTile(variant = 0) {
    const { canvas, ctx } = this.createCanvas(32, 32);
    
    // Base soil color
    ctx.fillStyle = this.palette.soil;
    ctx.fillRect(0, 0, 32, 32);
    
    // Tilled rows (depending on variant)
    ctx.strokeStyle = '#5a4a32';
    ctx.lineWidth = 2;
    
    if (variant % 2 === 0) {
      // Horizontal rows
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(32, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.lineTo(32, 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(32, 24);
      ctx.stroke();
    } else {
      // Diagonal rows
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(28, 32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(32, 28);
      ctx.stroke();
    }
    
    return canvas;
  }

  /**
   * Terrain: Water tile
   */
  waterTile(variant = 0) {
    const { canvas, ctx } = this.createCanvas(32, 32);
    
    ctx.fillStyle = this.palette.water_light;
    ctx.fillRect(0, 0, 32, 32);
    
    // Wave pattern
    ctx.fillStyle = this.palette.water_dark;
    const phase = variant % 4;
    const positions = [
      [0, 8, 32, 6],
      [0, 4, 32, 6],
      [0, 12, 32, 6],
      [0, 16, 32, 6],
    ];
    const [x, y, w, h] = positions[phase];
    ctx.fillRect(x, y, w, h);
    
    // Highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(4, 6, 8, 3);
    ctx.fillRect(16, 14, 12, 2);
    
    return canvas;
  }

  /**
   * Terrain: Stone tile
   */
  stoneTile(variant = 0) {
    const { canvas, ctx } = this.createCanvas(32, 32);
    
    ctx.fillStyle = this.palette.stone;
    ctx.fillRect(0, 0, 32, 32);
    
    // Cracks and shadows
    ctx.strokeStyle = '#5a504a';
    ctx.lineWidth = 1;
    
    const patterns = [
      [[4, 0, 4, 16], [16, 8, 16, 24]],
      [[0, 12, 20, 12], [8, 20, 24, 20]],
      [[2, 2, 2, 30], [10, 4, 10, 28], [20, 0, 20, 32]],
    ];
    
    for (const [x1, y1, x2, y2] of patterns[variant % 3]) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    
    return canvas;
  }

  /**
   * Plant: Grain/wheat crop
   */
  grainPlant(stage = 1) {
    const { canvas, ctx } = this.createCanvas(32, 32);
    
    ctx.fillStyle = this.palette.grass_light;
    ctx.fillRect(0, 0, 32, 32);
    
    // Stem
    ctx.fillStyle = this.palette.bark;
    ctx.fillRect(14, 16, 4, 12);
    
    // Grain head (grows with stage)
    const headY = stage === 1 ? 12 : stage === 2 ? 8 : 4;
    ctx.fillStyle = this.palette.grain;
    
    // Head shape
    ctx.beginPath();
    ctx.ellipse(16, headY, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Seeds
    ctx.fillStyle = '#9c7544';
    for (let i = 0; i < 5; i++) {
      const x = 12 + i * 2;
      const y = headY - 4 + (i % 2) * 2;
      ctx.fillRect(x, y, 2, 2);
    }
    
    return canvas;
  }

  /**
   * Plant: Tree (multiple growth stages)
   */
  tree(stage = 1, variant = 0) {
    const { canvas, ctx } = this.createCanvas(48, 48);
    
    ctx.fillStyle = this.palette.grass_light;
    ctx.fillRect(0, 0, 48, 48);
    
    // Trunk
    ctx.fillStyle = this.palette.bark;
    const trunkWidth = 4;
    const trunkHeight = stage === 1 ? 16 : stage === 2 ? 20 : 24;
    ctx.fillRect(22, 48 - trunkHeight, trunkWidth, trunkHeight);
    
    // Canopy (grows with stage)
    ctx.fillStyle = variant % 2 === 0 ? this.palette.leaf_dark : this.palette.leaf_light;
    const canopyY = 48 - trunkHeight - 12 - (stage - 1) * 4;
    
    if (stage === 1) {
      ctx.beginPath();
      ctx.ellipse(24, canopyY, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (stage === 2) {
      ctx.beginPath();
      ctx.ellipse(24, canopyY, 12, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(24, canopyY - 2, 14, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(24, canopyY + 6, 12, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return canvas;
  }

  /**
   * Animal: Cow/livestock
   */
  livestock(type = 'cow', variant = 0) {
    const { canvas, ctx } = this.createCanvas(48, 32);
    
    ctx.fillStyle = this.palette.grass_light;
    ctx.fillRect(0, 0, 48, 32);
    
    const colors = {
      cow: [this.palette.fur_brown, this.palette.flesh],
      pig: [this.palette.fur_gray, this.palette.flesh],
      sheep: [this.palette.white, this.palette.flesh],
    };
    
    const [bodyColor, accentColor] = colors[type] || colors.cow;
    
    // Body
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(24, 18, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Head
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(10, 16, 6, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Legs
    ctx.lineWidth = 3;
    ctx.strokeStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(16, 26);
    ctx.lineTo(16, 31);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(24, 26);
    ctx.lineTo(24, 31);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(32, 26);
    ctx.lineTo(32, 31);
    ctx.stroke();
    
    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(8, 14, 2, 2);
    ctx.fillRect(12, 14, 2, 2);
    
    // Horns or ears (depending on type)
    if (type === 'cow') {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(7, 12);
      ctx.lineTo(4, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(13, 12);
      ctx.lineTo(16, 8);
      ctx.stroke();
    }
    
    return canvas;
  }

  /**
   * Animal: Wild creature (deer, wolf, etc)
   */
  wildAnimal(type = 'deer', variant = 0) {
    const { canvas, ctx } = this.createCanvas(48, 32);
    
    ctx.fillStyle = this.palette.grass_light;
    ctx.fillRect(0, 0, 48, 32);
    
    const colors = {
      deer: this.palette.fur_light,
      wolf: this.palette.fur_gray,
      boar: this.palette.fur_brown,
    };
    
    const bodyColor = colors[type] || colors.deer;
    
    // Body
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(26, 18, 14, 9, 0.1, 0, Math.PI * 2);
    ctx.fill();
    
    // Head (pointed)
    ctx.beginPath();
    ctx.ellipse(12, 16, 5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Legs (thinner, more agile)
    ctx.lineWidth = 2;
    ctx.strokeStyle = bodyColor;
    for (let i = 0; i < 4; i++) {
      const x = 14 + i * 7;
      ctx.beginPath();
      ctx.moveTo(x, 25);
      ctx.lineTo(x, 31);
      ctx.stroke();
    }
    
    // Tail
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(38, 18);
    ctx.quadraticCurveTo(42, 16, 44, 20);
    ctx.stroke();
    
    // Eyes & features
    ctx.fillStyle = '#000';
    ctx.fillRect(10, 14, 2, 2);
    
    // Antlers/horns (deer only)
    if (type === 'deer') {
      ctx.strokeStyle = '#6b5138';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 12);
      ctx.lineTo(6, 6);
      ctx.lineTo(8, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(14, 12);
      ctx.lineTo(18, 6);
      ctx.lineTo(20, 2);
      ctx.stroke();
    }
    
    return canvas;
  }

  /**
   * NPC: Settler character
   */
  settler(gender = 'male', skinTone = 0, hairStyle = 0) {
    const { canvas, ctx } = this.createCanvas(32, 48);
    
    ctx.fillStyle = this.palette.grass_light;
    ctx.fillRect(0, 0, 32, 48);
    
    // Adjust skin tone
    const skinTones = [
      '#d4a574',
      '#c9956a',
      '#e8c9a0',
      '#b8956a',
    ];
    const skin = skinTones[skinTone % skinTones.length];
    
    // Head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(16, 12, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Hair
    const hairColors = [
      this.palette.hair_dark,
      this.palette.hair_light,
      '#4a5a3a',
      '#8b6f47',
    ];
    ctx.fillStyle = hairColors[hairStyle % hairColors.length];
    
    if (gender === 'female') {
      ctx.beginPath();
      ctx.ellipse(16, 10, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(16, 9, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Body
    ctx.fillStyle = this.palette.clothing_brown;
    ctx.fillRect(10, 20, 12, 16);
    
    // Arms
    ctx.lineWidth = 3;
    ctx.strokeStyle = skin;
    ctx.beginPath();
    ctx.moveTo(10, 22);
    ctx.lineTo(4, 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(22, 22);
    ctx.lineTo(28, 28);
    ctx.stroke();
    
    // Legs
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.palette.clothing_blue;
    ctx.beginPath();
    ctx.moveTo(12, 36);
    ctx.lineTo(12, 46);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, 36);
    ctx.lineTo(20, 46);
    ctx.stroke();
    
    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(14, 10, 1.5, 1.5);
    ctx.fillRect(17.5, 10, 1.5, 1.5);
    
    return canvas;
  }

  /**
   * Structure: Wooden house
   */
  house(roofColor = this.palette.wood) {
    const { canvas, ctx } = this.createCanvas(48, 48);
    
    ctx.fillStyle = this.palette.grass_light;
    ctx.fillRect(0, 0, 48, 48);
    
    // Walls
    ctx.fillStyle = this.palette.wood;
    ctx.fillRect(8, 20, 32, 20);
    
    // Roof
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(8, 20);
    ctx.lineTo(24, 8);
    ctx.lineTo(40, 20);
    ctx.closePath();
    ctx.fill();
    
    // Door
    ctx.fillStyle = '#6b5138';
    ctx.fillRect(20, 32, 8, 8);
    ctx.fillStyle = '#8b6f47';
    ctx.fillRect(26, 36, 1, 1);
    
    // Windows
    ctx.fillStyle = '#3d586b';
    ctx.fillRect(12, 24, 5, 5);
    ctx.fillRect(31, 24, 5, 5);
    
    // Window panes
    ctx.strokeStyle = this.palette.wood;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14.5, 24);
    ctx.lineTo(14.5, 29);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, 26.5);
    ctx.lineTo(17, 26.5);
    ctx.stroke();
    
    return canvas;
  }

  /**
   * Item: Generic resource
   */
  resource(type = 'grain', variant = 0) {
    const { canvas, ctx } = this.createCanvas(24, 24);
    
    ctx.fillStyle = this.palette.grass_light;
    ctx.fillRect(0, 0, 24, 24);
    
    const colors = {
      grain: this.palette.grain,
      wood: this.palette.wood,
      stone: this.palette.stone,
      tool: '#7a7a7a',
      food: '#c9956a',
      weapon: '#6b5138',
    };
    
    const color = colors[type] || this.palette.grain;
    ctx.fillStyle = color;
    
    if (type === 'grain') {
      ctx.beginPath();
      ctx.ellipse(12, 12, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'wood') {
      ctx.fillRect(6, 4, 12, 16);
    } else if (type === 'stone') {
      ctx.beginPath();
      ctx.moveTo(12, 4);
      ctx.lineTo(18, 10);
      ctx.lineTo(16, 20);
      ctx.lineTo(8, 20);
      ctx.lineTo(6, 10);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'tool') {
      ctx.fillRect(8, 6, 8, 12);
      ctx.fillRect(6, 8, 12, 2);
    } else if (type === 'food') {
      ctx.beginPath();
      ctx.ellipse(12, 12, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'weapon') {
      ctx.beginPath();
      ctx.moveTo(12, 4);
      ctx.lineTo(16, 8);
      ctx.lineTo(14, 20);
      ctx.lineTo(10, 20);
      ctx.lineTo(8, 8);
      ctx.closePath();
      ctx.fill();
    }
    
    return canvas;
  }

  /**
   * Weather effect: Rain/mist
   */
  rainEffect(intensity = 1) {
    const { canvas, ctx } = this.createCanvas(32, 32);
    
    ctx.fillStyle = 'rgba(200, 210, 230, 0.1)';
    ctx.fillRect(0, 0, 32, 32);
    
    ctx.strokeStyle = 'rgba(180, 200, 230, ' + (0.3 * intensity) + ')';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < 5 * intensity; i++) {
      const x = Math.random() * 32;
      const y = Math.random() * 32;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y + 4);
      ctx.stroke();
    }
    
    return canvas;
  }

  /**
   * Weather effect: Snow
   */
  snowEffect(intensity = 1) {
    const { canvas, ctx } = this.createCanvas(32, 32);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, 32, 32);
    
    ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.6 * intensity) + ')';
    
    for (let i = 0; i < 6 * intensity; i++) {
      const x = Math.random() * 32;
      const y = Math.random() * 32;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return canvas;
  }

  /**
   * Weather effect: Dust/smoke
   */
  dustEffect(intensity = 1) {
    const { canvas, ctx } = this.createCanvas(32, 32);
    
    ctx.fillStyle = 'rgba(200, 180, 150, 0.05)';
    ctx.fillRect(0, 0, 32, 32);
    
    // Particle clouds
    for (let i = 0; i < 3 * intensity; i++) {
      const x = Math.random() * 32;
      const y = Math.random() * 32;
      const size = 2 + Math.random() * 4;
      
      ctx.fillStyle = 'rgba(200, 180, 150, ' + (0.2 * Math.random()) + ')';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return canvas;
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpriteGenerator;
}
