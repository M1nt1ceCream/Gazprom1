[out:json][timeout:180];
(
  nwr["man_made"]({{bbox}});
  nwr["industrial"]({{bbox}});
  nwr["landuse"]({{bbox}});
  nwr["natural"]({{bbox}});
  nwr["waterway"]({{bbox}});
  nwr["seamark:type"]({{bbox}});
  nwr["public_transport"]({{bbox}});
  nwr["amenity"]({{bbox}});
);
out center geom;
