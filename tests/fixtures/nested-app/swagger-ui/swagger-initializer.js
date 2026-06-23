window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: "",
    dom_id: "#swagger-ui",
    "configUrl": "/fixtures/nested-app/v3/api-docs/swagger-config",
  })
}
