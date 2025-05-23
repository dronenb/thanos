import $ from 'jquery';
import React, { PureComponent } from 'react';
import ReactResizeDetector from 'react-resize-detector';

import { Legend } from './Legend';
import { Metric, QueryParams, SampleValue, SampleHistogram } from '../../types/types';
import { isPresent } from '../../utils';
import { normalizeData, getOptions, toHoverColor } from './GraphHelpers';

require('../../vendor/flot/jquery.flot');
require('../../vendor/flot/jquery.flot.stack');
require('../../vendor/flot/jquery.flot.time');
require('../../vendor/flot/jquery.flot.crosshair');
require('../../vendor/flot/jquery.flot.selection');
require('jquery.flot.tooltip');

export interface GraphProps {
  data: {
    resultType: string;
    result: Array<{ metric: Metric; values: SampleValue[]; histograms?: SampleHistogram[] }>;
  };
  stacked: boolean;
  useLocalTime: boolean;
  handleTimeRangeSelection: (startTime: number, endTime: number) => void;
  queryParams: QueryParams | null;
}

export interface GraphSeries {
  labels: { [key: string]: string };
  color: string;
  data: (number | null)[][]; // [x,y][]
  index: number;
}

interface GraphState {
  chartData: GraphSeries[];
}

class Graph extends PureComponent<GraphProps, GraphState> {
  private chartRef = React.createRef<HTMLDivElement>();
  private $chart?: jquery.flot.plot;
  private rafID = 0;
  private selectedSeriesIndexes: number[] = [];

  state = {
    chartData: normalizeData(this.props),
  };

  componentDidUpdate(prevProps: GraphProps): void {
    const { data, stacked, useLocalTime } = this.props;
    if (prevProps.data !== data) {
      this.selectedSeriesIndexes = [];
      this.setState({ chartData: normalizeData(this.props) }, this.plot);
    } else if (prevProps.stacked !== stacked) {
      this.setState({ chartData: normalizeData(this.props) }, () => {
        if (this.selectedSeriesIndexes.length === 0) {
          this.plot();
        } else {
          this.plot(this.state.chartData.filter((_, i) => this.selectedSeriesIndexes.includes(i)));
        }
      });
    }

    if (prevProps.useLocalTime !== useLocalTime) {
      this.plot();
    }
  }

  componentDidMount(): void {
    this.plot();

    $(`.graph-chart`).bind('plotselected', (_, ranges) => {
      if (isPresent(this.$chart)) {
        // eslint-disable-next-line
        // @ts-ignore Typescript doesn't think this method exists although it actually does.
        this.$chart.clearSelection();
        this.props.handleTimeRangeSelection(ranges.xaxis.from, ranges.xaxis.to);
      }
    });
  }

  componentWillUnmount(): void {
    this.destroyPlot();
  }

  plot = (data: GraphSeries[] = this.state.chartData) => {
    if (!this.chartRef.current) {
      return;
    }
    this.destroyPlot();

    this.$chart = $.plot($(this.chartRef.current), data, getOptions(this.props.stacked, this.props.useLocalTime));
  };

  destroyPlot = (): void => {
    if (isPresent(this.$chart)) {
      this.$chart.destroy();
    }
  };

  plotSetAndDraw(data: GraphSeries[] = this.state.chartData): void {
    if (isPresent(this.$chart)) {
      this.$chart.setData(data);
      this.$chart.draw();
    }
  }

  handleSeriesSelect = (selected: number[], selectedIndex: number): void => {
    const { chartData } = this.state;
    this.plot(
      this.selectedSeriesIndexes.length === 1 && this.selectedSeriesIndexes.includes(selectedIndex)
        ? chartData.map(toHoverColor(selectedIndex, this.props.stacked))
        : chartData.filter((_, i) => selected.includes(i)) // draw only selected
    );
    this.selectedSeriesIndexes = selected;
  };

  handleSeriesHover = (index: number) => () => {
    if (this.rafID) {
      cancelAnimationFrame(this.rafID);
    }
    this.rafID = requestAnimationFrame(() => {
      this.plotSetAndDraw(this.state.chartData.map(toHoverColor(index, this.props.stacked)));
    });
  };

  handleLegendMouseOut = (): void => {
    cancelAnimationFrame(this.rafID);
    this.plotSetAndDraw();
  };

  handleResize = (): void => {
    if (isPresent(this.$chart)) {
      this.plot(this.$chart.getData() as GraphSeries[]);
    }
  };

  render(): JSX.Element {
    const { chartData } = this.state;
    return (
      <div className="graph">
        <ReactResizeDetector handleWidth onResize={this.handleResize} skipOnMount />
        <div className="graph-chart" ref={this.chartRef} />
        <Legend
          shouldReset={this.selectedSeriesIndexes.length === 0}
          chartData={chartData}
          onHover={this.handleSeriesHover}
          onLegendMouseOut={this.handleLegendMouseOut}
          onSeriesToggle={this.handleSeriesSelect}
        />
      </div>
    );
  }
}

export default Graph;
