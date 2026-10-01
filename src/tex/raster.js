import { hexToRgb, clampByte } from '../core/color.js';

const toRgb = (color) => (typeof color === 'string' ? hexToRgb(color) : color);

/**
 * Deterministic RGBA pixel buffer. Row 0 is v = 0 (bottom of the texture), so drawing
 * coordinates match UV space: x grows right, y grows up. X wraps around for cylindrical UVs.
 */
export class Raster {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  index(x, y) {
    const wx = ((Math.floor(x) % this.width) + this.width) % this.width;
    const wy = Math.floor(y);
    if (wy < 0 || wy >= this.height) return -1;
    return (wy * this.width + wx) * 4;
  }

  get(x, y) {
    const i = this.index(x, y);
    if (i < 0) return [0, 0, 0, 0];
    const d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  plot(x, y, color, alpha = 1) {
    const i = this.index(x, y);
    if (i < 0 || alpha <= 0) return;
    const [r, g, b] = toRgb(color);
    const d = this.data;
    const a = Math.min(1, alpha);
    d[i] = clampByte(d[i] + (r - d[i]) * a);
    d[i + 1] = clampByte(d[i + 1] + (g - d[i + 1]) * a);
    d[i + 2] = clampByte(d[i + 2] + (b - d[i + 2]) * a);
    d[i + 3] = Math.max(d[i + 3], Math.round(a * 255));
  }

  fill(color) {
    const [r, g, b] = toRgb(color);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    }
    return this;
  }

  rect(x, y, w, h, color, alpha = 1) {
    for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
      for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) this.plot(xx, yy, color, alpha);
    }
    return this;
  }

  ellipse(cx, cy, rx, ry, color, alpha = 1, softness = 0) {
    for (let yy = Math.floor(cy - ry - 1); yy <= Math.ceil(cy + ry + 1); yy++) {
      for (let xx = Math.floor(cx - rx - 1); xx <= Math.ceil(cx + rx + 1); xx++) {
        const dx = (xx + 0.5 - cx) / rx;
        const dy = (yy + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) continue;
        const edge = softness > 0 ? Math.min(1, (1 - d) / softness) : 1;
        this.plot(xx, yy, color, alpha * edge);
      }
    }
    return this;
  }

  line(x0, y0, x1, y1, color, width = 1, alpha = 1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    const r = width / 2;
    const stamped = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      for (let yy = Math.floor(cy - r); yy <= Math.floor(cy + r); yy++) {
        for (let xx = Math.floor(cx - r); xx <= Math.floor(cx + r); xx++) {
          if (Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) > r + 0.35) continue;
          const key = yy * 100000 + xx;
          if (stamped.has(key)) continue;
          stamped.add(key);
          this.plot(xx, yy, color, alpha);
        }
      }
    }
    return this;
  }

  polyline(points, color, width = 1, alpha = 1) {
    for (let i = 0; i < points.length - 1; i++) {
      this.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], color, width, alpha);
    }
    return this;
  }

  polygon(points, color, alpha = 1) {
    const ys = points.map((p) => p[1]);
    const minY = Math.floor(Math.min(...ys));
    const maxY = Math.ceil(Math.max(...ys));
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.plot(x, y, color, alpha);
      }
    }
    return this;
  }

  verticalGradient(y0, y1, top, bottom, alpha = 1) {
    const a = toRgb(bottom);
    const b = toRgb(top);
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      for (let x = 0; x < this.width; x++) this.plot(x, y, c, alpha);
    }
    return this;
  }

  /** Multiplies brightness in a region by k (k<1 darkens, k>1 lightens). */
  tone(x, y, w, h, k, alpha = 1) {
    for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
      for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
        const [r, g, b, a] = this.get(xx, yy);
        if (a === 0) continue;
        this.plot(xx, yy, [r * k, g * k, b * k], alpha);
      }
    }
    return this;
  }

  toneEllipse(cx, cy, rx, ry, k, alpha = 1) {
    for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) {
      for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
        const dx = (xx + 0.5 - cx) / rx;
        const dy = (yy + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) continue;
        const [r, g, b] = this.get(xx, yy);
        const f = 1 + (k - 1) * (1 - d);
        this.plot(xx, yy, [r * f, g * f, b * f], alpha);
      }
    }
    return this;
  }

  /** Per-pixel value noise, amount is a fraction of brightness (0.06 = ±6%). */
  grain(rng, amount) {
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      const k = 1 + (rng.next() * 2 - 1) * amount;
      d[i] = clampByte(d[i] * k);
      d[i + 1] = clampByte(d[i + 1] * k);
      d[i + 2] = clampByte(d[i + 2] * k);
    }
    return this;
  }

  /** Coarse cell noise that imitates JPEG/VQ compression blocks. */
  blocks(rng, cell, amount) {
    for (let by = 0; by < this.height; by += cell) {
      for (let bx = 0; bx < this.width; bx += cell) {
        const k = 1 + (rng.next() * 2 - 1) * amount;
        for (let y = by; y < Math.min(this.height, by + cell); y++) {
          for (let x = bx; x < Math.min(this.width, bx + cell); x++) {
            const i = (y * this.width + x) * 4;
            this.data[i] = clampByte(this.data[i] * k);
            this.data[i + 1] = clampByte(this.data[i + 1] * k);
            this.data[i + 2] = clampByte(this.data[i + 2] * k);
          }
        }
      }
    }
    return this;
  }

  /** Posterizes to `levels` steps per channel to fake a 15/16-bit source texture. */
  posterize(levels = 32) {
    const step = 255 / (levels - 1);
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(d[i] / step) * step;
      d[i + 1] = Math.round(d[i + 1] / step) * step;
      d[i + 2] = Math.round(d[i + 2] / step) * step;
    }
    return this;
  }

  /** Copies another raster into a rectangle of this one (nearest sampling). */
  blit(src, x, y, w = src.width, h = src.height) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const sx = Math.floor((xx / w) * src.width);
        const sy = Math.floor((yy / h) * src.height);
        const [r, g, b, a] = src.get(sx, sy);
        if (a > 0) this.plot(x + xx, y + yy, [r, g, b], a / 255);
      }
    }
    return this;
  }
}
