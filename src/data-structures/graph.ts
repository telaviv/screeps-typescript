import { flatten, uniqBy } from "lodash";

/**
 *
 *
 * @export
 * @class Graph
 */
export class Graph {
  private directed: boolean;
  private verticies: { [key: string]: GraphVertex } = {};

  /**
   * Creates an instance of Graph.
   * @param {boolean} directed
   * @memberof Graph
   */
  constructor(directed: boolean) {
    this.directed = directed;
    this.verticies = {};
  }

  isDirected(): boolean {
    return this.directed;
  }

  /**
   * Add a vertex to the graph
   *
   * @param {GraphVertex} vertex
   * @return {Graph}
   * @memberof Graph
   */
  addVertex(vertex: GraphVertex): Graph {
    this.verticies[vertex.getKey()] = vertex;
    return this;
  }

  /**
   * @param {GraphEdge} edge
   * @return {Graph}
   * @memberof Graph
   */
  addEdge(edge: GraphEdge): Graph {
    const start = edge.startVertex;
    if (!this.getVertex(start)) {
      this.addVertex(edge.startVertex);
    }

    const end = edge.endVertex;
    if (!this.getVertex(end)) {
      this.addVertex(edge.endVertex);
    }

    if (this.directed) {
      this.getVertex(start).addEdge(edge);
    } else {
      this.getVertex(start).addEdge(edge);
      this.getVertex(end).addEdge(edge);
    }

    return this;
  }

  /**
   * @param {GraphVertex} vertex
   * @return {GraphVertex}
   * @memberof Graph
   */
  getVertex(vertex: GraphVertex): GraphVertex {
    return this.verticies[vertex.getKey()] || null;
  }

  /**
   *
   *
   * @return {GraphVertex[]}
   * @memberof Graph
   */
  getVertices(): GraphVertex[] {
    return Object.keys(this.verticies).map((k) => this.verticies[k]);
  }

  /**
   *
   *
   * @return {GraphEdge[]}
   * @memberof Graph
   */
  getEdges(): GraphEdge[] {
    return uniqBy(
      flatten([...this.getVertices().map((v) => v.getEdges())]),
      (e) => `${e.startVertex.key}:${e.endVertex.key}`
    )
  }

  /**
   * @param {GraphVertex} vertex
   * @return {GraphVertex[]}
   * @memberof Graph
   */
  getNeighbors(vertex: GraphVertex): GraphVertex[] {
    return this.getVertex(vertex).getNeighbors();
  }

  /**
   * @param {GraphVertex} start
   * @param {GraphVertex} end
   * @return {GraphEdge}
   * @memberof Graph
   */
  findEdge(start: GraphVertex, end: GraphVertex): GraphEdge | null {
    const vertex = this.getVertex(start);
    if (!vertex) {
      return null;
    }

    return vertex.findEdge(end);
  }

  /**
   * @return {string}
   * @memberof Graph
   */
  toString(): string {
    return Object.keys(this.verticies).toString();
  }
}

/**
 *
 *
 * @export
 * @class GraphVertex
 */
export class GraphVertex {
  public key: string;
  private edges: GraphEdge[];

  /**
   *Creates an instance of GraphVertex.
   * @param {string} key
   * @memberof GraphVertex
   */
  constructor(key: string) {
    this.key = key;
    this.edges = [];
  }

  /**
   * @return {string}
   * @memberof GraphVertex
   */
  getKey(): string {
    return this.key;
  }

  /**
   * @param {GraphEdge} edge
   * @return {GraphVertex}
   * @memberof GraphVertex
   */
  addEdge(edge: GraphEdge): GraphVertex {
    this.edges.push(edge);
    return this;
  }

  /**
   * @param {GraphVertex} vertex
   * @return {GraphEdge}
   * @memberof GraphVertex
   */
  findEdge(vertex: GraphVertex): GraphEdge {
    const edge = this.edges.filter((edge) => {
      return edge.startVertex === vertex || edge.endVertex === vertex;
    });

    return edge[0] ?? null;
  }

  /**
   * @return {GraphVertex[]}
   * @memberof GraphVertex
   */
  getNeighbors(): GraphVertex[] {
    const edges = this.edges;

    return edges.map((edge) => {
      return edge.startVertex === this ? edge.endVertex : edge.startVertex;
    });
  }

  /**
   * @return {GraphEdge[]}
   * @memberof GraphVertex
   */
  getEdges(): GraphEdge[] {
    return this.edges;
  }
}

/**
 *
 *
 * @export
 * @class GraphEdge
 */
export class GraphEdge {
  startVertex: GraphVertex;
  endVertex: GraphVertex;
  weight: number;

  /**
   *Creates an instance of GraphEdge.
   * @param {GraphVertex} startVertex
   * @param {GraphVertex} endVertex
   * @param {number} [weight=0]
   * @memberof GraphEdge
   */
  constructor(startVertex: GraphVertex, endVertex: GraphVertex, weight = 0) {
    this.startVertex = startVertex;
    this.endVertex = endVertex;
    this.weight = weight;
  }
}
