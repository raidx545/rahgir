"""LangGraph orchestrator:

    route → sample → places → rank → narrator → END

The graph is compiled once at startup. A shared httpx.AsyncClient is bound to
the async nodes via functools.partial so nodes stay import-light and testable.
"""
from __future__ import annotations

import functools

import httpx
from langgraph.graph import END, StateGraph

from .nodes.narrator import narrator_node
from .nodes.places import places_node
from .nodes.rank import rank_node
from .nodes.route import route_node
from .nodes.sample import sample_node
from .schemas import TripState


def build_graph(client: httpx.AsyncClient):
    g = StateGraph(TripState)

    g.add_node("route", functools.partial(route_node, client=client))
    g.add_node("sample", sample_node)
    g.add_node("places", functools.partial(places_node, client=client))
    g.add_node("rank", rank_node)
    g.add_node("narrator", functools.partial(narrator_node, client=client))

    g.set_entry_point("route")
    g.add_edge("route", "sample")
    g.add_edge("sample", "places")
    g.add_edge("places", "rank")
    g.add_edge("rank", "narrator")
    g.add_edge("narrator", END)

    return g.compile()
