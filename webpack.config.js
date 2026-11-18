const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlInlineScriptPlugin = require("html-inline-script-webpack-plugin");

module.exports = (env, argv) => ({
  mode: argv.mode === "production" ? "production" : "development",
  devtool: argv.mode === "production" ? false : "inline-source-map",
  entry: {
    code: "./src/code.ts",
    ui: "./src/ui/index.ts",
  },
  module: {
    rules: [
      // The plugin sandbox and the UI iframe have different globals, so each gets its own tsconfig.
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, "src/ui"),
        loader: "ts-loader",
        options: { instance: "ui", configFile: path.resolve(__dirname, "src/ui/tsconfig.json") },
      },
      {
        test: /\.ts$/,
        exclude: [/node_modules/, path.resolve(__dirname, "src/ui")],
        loader: "ts-loader",
        options: { instance: "plugin", configFile: path.resolve(__dirname, "tsconfig.json") },
      },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  resolve: { extensions: [".ts", ".js"] },
  output: {
    filename: (pathData) =>
      pathData.chunk.name === "code" ? "code.js" : "[name].[contenthash].js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      global: {}, // Fix missing symbol error when running in developer VM
    }),
    new HtmlWebpackPlugin({
      template: "./src/ui/index.html",
      filename: "ui.html",
      chunks: ["ui"],
      inject: "body", // Inlined scripts ignore `defer`, so they must run after the DOM.
    }),
    new HtmlInlineScriptPlugin({
      htmlMatchPattern: [/.html$/],
      scriptMatchPattern: [/.js$/],
    }),
  ],
});
