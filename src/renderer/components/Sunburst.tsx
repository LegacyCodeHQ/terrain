import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import type { TreeNode } from '@/shared/tree';

interface Props {
  data: TreeNode;
  /**
   * Path of node names from root to the desired focus, e.g.
   * `["repo", "src", "main"]`. Applied once when the chart mounts. If the
   * path can't be fully resolved, focuses the deepest matching ancestor
   * (or root if nothing matches).
   */
  initialFocusPath?: string[];
  /**
   * Called whenever the user changes the zoom focus (slice click, center
   * click, or breadcrumb click). The path is from root, e.g. ["repo"] for
   * the unzoomed view.
   */
  onFocusChange?: (path: string[]) => void;
}

const WIDTH = 928;
const HEIGHT = 928;
const RADIUS = WIDTH / 6;

type ArcDatum = d3.HierarchyRectangularNode<TreeNode> & {
  current: { x0: number; x1: number; y0: number; y1: number };
  target?: { x0: number; x1: number; y0: number; y1: number };
};

// d3 transitions don't unify across heterogeneous selections; reuse via a
// widened type so `path.transition(t)` and `label.transition(t)` both compile.
// biome-ignore lint/suspicious/noExplicitAny: see comment above
type AnyTransition = d3.Transition<any, any, any, any>;

const numberFormat = d3.format(',d');

function arcVisible(d: { x0: number; x1: number; y0: number; y1: number }) {
  return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
}

function labelVisible(d: { x0: number; x1: number; y0: number; y1: number }) {
  return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
}

function labelTransform(d: { x0: number; x1: number; y0: number; y1: number }) {
  const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
  const y = ((d.y0 + d.y1) / 2) * RADIUS;
  return `rotate(${x - 90}) translate(${y},0) rotate(${x < 90 ? 0 : 180})`;
}

export function Sunburst({ data, initialFocusPath, onFocusChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [breadcrumb, setBreadcrumb] = useState<TreeNode[]>([]);
  const focusFnRef = useRef<((node: TreeNode) => void) | null>(null);

  // Stable refs so the effect doesn't re-run when these change. The
  // initial-focus path is only consumed once on mount; the change callback
  // is read on each user click.
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;
  const initialFocusPathRef = useRef(initialFocusPath);
  // Don't update — first mount value only.

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const hierarchy = d3
      .hierarchy<TreeNode>(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const root = d3
      .partition<TreeNode>()
      .size([2 * Math.PI, hierarchy.height + 1])(hierarchy) as ArcDatum;

    root.each((d) => {
      const ad = d as ArcDatum;
      ad.current = { x0: ad.x0, x1: ad.x1, y0: ad.y0, y1: ad.y1 };
    });

    const topLevelCount = (data.children?.length ?? 0) + 1;
    const color = d3.scaleOrdinal(
      d3.quantize(d3.interpolateRainbow, topLevelCount),
    );

    const svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'sunburst__svg')
      .attr('viewBox', [-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT].join(' '))
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('font', '10px sans-serif');

    const arc = d3
      .arc<{ x0: number; x1: number; y0: number; y1: number }>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(RADIUS * 1.5)
      .innerRadius((d) => d.y0 * RADIUS)
      .outerRadius((d) => Math.max(d.y0 * RADIUS, d.y1 * RADIUS - 1));

    const path = svg
      .append('g')
      .selectAll<SVGPathElement, ArcDatum>('path')
      .data(root.descendants().slice(1) as ArcDatum[])
      .join('path')
      .attr('fill', (d) => {
        let cursor = d as d3.HierarchyNode<TreeNode>;
        while (cursor.depth > 1 && cursor.parent) cursor = cursor.parent;
        return color(cursor.data.name);
      })
      .attr('fill-opacity', (d) =>
        arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0,
      )
      .attr('pointer-events', (d) => (arcVisible(d.current) ? 'auto' : 'none'))
      .attr('d', (d) => arc(d.current) ?? '');

    path
      .filter((d) => Boolean(d.children))
      .style('cursor', 'pointer')
      .on('click', (event, d) => clicked(event, d, 750));

    path.append('title').text(
      (d) =>
        `${d
          .ancestors()
          .map((n) => n.data.name)
          .reverse()
          .join('/')}\n${numberFormat(d.value ?? 0)} lines`,
    );

    const label = svg
      .append('g')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .style('user-select', 'none')
      .style('fill', '#f0f0f0')
      .selectAll<SVGTextElement, ArcDatum>('text')
      .data(root.descendants().slice(1) as ArcDatum[])
      .join('text')
      .attr('dy', '0.35em')
      .attr('fill-opacity', (d) => +labelVisible(d.current))
      .attr('transform', (d) => labelTransform(d.current))
      .text((d) => d.data.name);

    let focusNode: ArcDatum = root;
    setBreadcrumb([root.data]);

    const parent = svg
      .append('circle')
      .datum(root)
      .attr('r', RADIUS)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('click', (event) => {
        if (focusNode.parent) {
          clicked(event, focusNode.parent as ArcDatum, 750);
        }
      });

    focusFnRef.current = (target: TreeNode) => {
      const targetNode = (root.descendants() as ArcDatum[]).find(
        (n) => n.data === target,
      );
      if (targetNode) clicked(null, targetNode, 750);
    };

    function clicked(_event: unknown, p: ArcDatum, durationMs: number) {
      focusNode = p;
      parent.datum(p.parent ?? root);
      const ancestorData = p
        .ancestors()
        .map((n) => n.data)
        .reverse();
      setBreadcrumb(ancestorData);
      onFocusChangeRef.current?.(ancestorData.map((n) => n.name));

      root.each((node) => {
        const nd = node as ArcDatum;
        nd.target = {
          x0:
            Math.max(0, Math.min(1, (nd.x0 - p.x0) / (p.x1 - p.x0))) *
            2 *
            Math.PI,
          x1:
            Math.max(0, Math.min(1, (nd.x1 - p.x0) / (p.x1 - p.x0))) *
            2 *
            Math.PI,
          y0: Math.max(0, nd.y0 - p.depth),
          y1: Math.max(0, nd.y1 - p.depth),
        };
      });

      const t = svg.transition().duration(durationMs) as AnyTransition;

      path
        .transition(t)
        .tween('data', (d) => {
          const interp = d3.interpolate(d.current, d.target ?? d.current);
          return (tt) => {
            d.current = interp(tt);
          };
        })
        .filter(function (d) {
          const fo = Number(this.getAttribute('fill-opacity') ?? '0');
          return Boolean(fo) || arcVisible(d.target ?? d.current);
        })
        .attr('fill-opacity', (d) =>
          arcVisible(d.target ?? d.current) ? (d.children ? 0.6 : 0.4) : 0,
        )
        .attr('pointer-events', (d) =>
          arcVisible(d.target ?? d.current) ? 'auto' : 'none',
        )
        .attrTween('d', (d) => () => arc(d.current) ?? '');

      label
        .filter(function (d) {
          const fo = Number(this.getAttribute('fill-opacity') ?? '0');
          return Boolean(fo) || labelVisible(d.target ?? d.current);
        })
        .transition(t)
        .attr('fill-opacity', (d) => +labelVisible(d.target ?? d.current))
        .attrTween('transform', (d) => () => labelTransform(d.current));
    }

    // Snap to the persisted focus path, if any. Walk root → ... by name and
    // stop at the deepest match (or root if nothing matches beyond it).
    const focusPath = initialFocusPathRef.current;
    if (focusPath && focusPath.length > 1) {
      let cursor: ArcDatum = root;
      // First segment is the root's own name; start matching at index 1.
      for (let i = 1; i < focusPath.length; i++) {
        const name = focusPath[i];
        const child = (cursor.children as ArcDatum[] | undefined)?.find(
          (c) => c.data.name === name,
        );
        if (!child) break;
        cursor = child;
      }
      if (cursor !== root) {
        clicked(null, cursor, 0);
      }
    }

    return () => {
      container.innerHTML = '';
      focusFnRef.current = null;
    };
  }, [data]);

  const focusByPath = (depth: number) => {
    const target = breadcrumb[depth];
    if (target && focusFnRef.current) focusFnRef.current(target);
  };

  return (
    <div className="sunburst" ref={containerRef as never}>
      <div className="breadcrumb">
        {breadcrumb.map((node, i) => {
          const isLast = i === breadcrumb.length - 1;
          return (
            <span key={`${i}-${node.name}`} style={{ display: 'contents' }}>
              {i > 0 ? <span className="breadcrumb__separator">/</span> : null}
              <button
                type="button"
                className={`breadcrumb__segment${
                  isLast ? ' breadcrumb__segment--current' : ''
                }`}
                onClick={() => focusByPath(i)}
                disabled={isLast}
              >
                {node.name}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
