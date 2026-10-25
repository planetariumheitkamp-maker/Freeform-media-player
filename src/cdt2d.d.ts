declare module 'cdt2d' {
  type Triangle = [number, number, number];
  type Edge = [number, number];
  type Point = [number, number];

  interface CdtOptions {
    delaunay?: boolean;
    interior?: boolean;
    exterior?: boolean;
    infinity?: boolean;
  }

  export default function cdt2d(
    points: Point[],
    edges?: Edge[],
    options?: CdtOptions,
  ): Triangle[];
}
