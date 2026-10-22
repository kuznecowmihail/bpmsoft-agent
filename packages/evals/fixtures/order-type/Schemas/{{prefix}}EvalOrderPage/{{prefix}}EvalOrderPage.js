define("{{prefix}}EvalOrderPage", [], function() {
	return {
		entitySchemaName: "{{prefix}}EvalOrder",
		details: /**SCHEMA_DETAILS*/{}/**SCHEMA_DETAILS*/,
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "Name",
				"values": {
					"layout": {"colSpan": 24, "rowSpan": 1, "column": 0, "row": 0},
					"bindTo": "Name"
				},
				"parentName": "Header",
				"propertyName": "items",
				"index": 0
			},
			{
				"operation": "insert",
				"name": "Type",
				"values": {
					"layout": {"colSpan": 12, "rowSpan": 1, "column": 0, "row": 1},
					"bindTo": "Type"
				},
				"parentName": "Header",
				"propertyName": "items",
				"index": 1
			}
		]/**SCHEMA_DIFF*/,
		methods: {}
	};
});
